#!/usr/bin/env bun
/**
 * Recompute every recipe's nutrition from Firebase cache, with live fallback.
 *
 * Resolution order for each ingredient:
 *   1. Firestore openFoodFactsNutritionCache
 *   2. USDA FoodData Central
 *   3. OpenFoodFacts
 *
 * Live matches and misses are written back to the cache unless --dry-run is
 * used. Recipe nutrition is then written to Firestore and, when a matching
 * recommender recipe exists, the recommender.
 *
 * Usage:
 *   bun scripts/recalc-nutrition.ts --dry-run
 *   bun scripts/recalc-nutrition.ts
 */

import { FieldValue } from "firebase-admin/firestore";

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import {
  cacheKeyForName,
  curatedNutritionProductForIngredient,
  estimateIngredientNutrition,
  readCachedProduct,
  totalNutritionFromEstimates,
  writeCachedProduct,
  type IngredientNutritionEstimate,
  type OpenFoodFactsProduct,
} from "./ingest/openfoodfacts.ts";
import { bulkUpsertRecipes, listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";
import { resolveIngredientProduct } from "./ingest/resolve.ts";
import type { Ingredient } from "./ingest/types.ts";

const args = process.argv.slice(2);
function flag(name: string): boolean {
  return args.includes(name);
}
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const isDryRun = flag("--dry-run");
const skipRecommender = flag("--no-recommender") || isDryRun;
const skipFirestore = flag("--no-firestore") || isDryRun;
const source = option("--source") ?? "both";
const force = flag("--force");
const baseUrl = recommenderUrl(option("--recommender-url"));
const usdaDelayMs = Number(option("--usda-delay") ?? 1100);
const offDelayMs = Number(option("--delay") ?? 6500);
const ttlMs = Number(option("--ttl-days") ?? 90) * 24 * 60 * 60 * 1000;
const missTtlMs = Number(option("--miss-ttl-days") ?? 14) * 24 * 60 * 60 * 1000;

type RecipeForNutrition = {
  id: string;
  ingredients: Ingredient[];
  recommenderRecipe?: RecipeOut;
};

function isIngredient(value: unknown): value is Ingredient {
  const ingredient = value as Partial<Ingredient> | null;
  return (
    ingredient !== null &&
    typeof ingredient === "object" &&
    typeof ingredient.name === "string" &&
    typeof ingredient.quantity === "number" &&
    typeof ingredient.unit === "string"
  );
}

async function listFirestoreRecipes(): Promise<RecipeForNutrition[]> {
  const snapshot = await getFirestore().collection("recipes").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: typeof data.id === "string" ? data.id : doc.id,
      ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter(isIngredient) : [],
    };
  });
}

async function listRecipesForNutrition(): Promise<RecipeForNutrition[]> {
  if (!["firestore", "recommender", "both"].includes(source)) {
    throw new Error("--source must be firestore, recommender, or both");
  }

  const byId = new Map<string, RecipeForNutrition>();

  if (source === "firestore" || source === "both") {
    for (const recipe of await listFirestoreRecipes()) {
      byId.set(recipe.id, recipe);
    }
  }

  if (source === "recommender" || source === "both" || !skipRecommender) {
    const recipes = await listRecipes(baseUrl);
    for (const recipe of recipes) {
      const existing = byId.get(recipe.id);
      byId.set(recipe.id, {
        id: recipe.id,
        ingredients: existing?.ingredients.length ? existing.ingredients : recipe.ingredients ?? [],
        recommenderRecipe: recipe,
      });
    }
  }

  return [...byId.values()];
}

async function productForIngredient(
  cache: Map<string, OpenFoodFactsProduct | null>,
  ingredient: Ingredient,
): Promise<OpenFoodFactsProduct | null> {
  const cacheKey = cacheKeyForName(ingredient.name);
  const curated = curatedNutritionProductForIngredient(ingredient.name);

  if (curated) {
    cache.set(cacheKey, curated);
    if (!isDryRun) {
      await writeCachedProduct(getFirestore(), cacheKey, curated, ttlMs);
    }
    return curated;
  }

  if (!force && cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  if (!force) {
    const cached = await readCachedProduct(getFirestore(), cacheKey);
    if (cached !== undefined) {
      const isUsable = cached === null || estimateIngredientNutrition(ingredient, cached) !== null;
      if (isUsable) {
        cache.set(cacheKey, cached);
        return cached;
      }
    }
  }

  const { product } = await resolveIngredientProduct(ingredient.name, {
    usdaMs: usdaDelayMs,
    offMs: offDelayMs,
    useOpenFoodFacts: true,
  });

  cache.set(cacheKey, product);
  if (!isDryRun) {
    await writeCachedProduct(getFirestore(), cacheKey, product, product ? ttlMs : missTtlMs);
  }
  return product;
}

async function nutritionForRecipe(recipe: RecipeForNutrition, cache: Map<string, OpenFoodFactsProduct | null>) {
  const estimates: IngredientNutritionEstimate[] = [];
  const missing: string[] = [];

  for (const ingredient of recipe.ingredients) {
    const product = await productForIngredient(cache, ingredient);
    const estimate = product ? estimateIngredientNutrition(ingredient, product) : null;
    if (estimate) estimates.push(estimate);
    else missing.push(ingredient.name);
  }

  if (estimates.length > 0) {
    return totalNutritionFromEstimates(estimates, missing);
  }

  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: {
      provider: "USDA + OpenFoodFacts" as const,
      label: "USDA + OpenFoodFacts estimate",
      fetchedAt: new Date().toISOString(),
      matchedIngredients: [],
      missingIngredients: missing,
    },
  };
}

async function main() {
  console.log("=== Recipe Nutrition Recalculation (cache -> USDA -> OpenFoodFacts) ===");
  if (isDryRun) console.log("DRY RUN - cache and recipes will not be written");

  initFirebase();

  console.log(`\nFetching recipes from ${source}...`);
  const recipes = await listRecipesForNutrition();
  console.log(`Fetched ${recipes.length} recipes`);

  const cache = new Map<string, OpenFoodFactsProduct | null>();
  const updated = [];
  for (const recipe of recipes) {
    updated.push({
      ...recipe,
      nutrition: await nutritionForRecipe(recipe, cache),
    });
  }

  const withMissing = updated.filter((recipe) => recipe.nutrition.source.missingIngredients.length > 0);
  console.log(`\nRecomputed ${updated.length} recipes (${withMissing.length} with missing ingredients)`);
  for (const recipe of withMissing.slice(0, 20)) {
    console.log(`  ${recipe.id}: missing ${recipe.nutrition.source.missingIngredients.join(", ")}`);
  }
  if (withMissing.length > 20) console.log(`  ... ${withMissing.length - 20} more with missing ingredients`);

  if (!skipRecommender) {
    const recommenderUpdates = updated.filter((recipe) => recipe.recommenderRecipe);
    console.log(`\nWriting ${recommenderUpdates.length} recipe(s) to recommender API...`);
    const payload = recommenderUpdates.map((recipe) => {
      const { difficulty: _difficulty, embedding_text: _embeddingText, ...baseRecipe } = recipe.recommenderRecipe!;
      return { ...baseRecipe, nutrition: recipe.nutrition };
    });
    const written = await bulkUpsertRecipes(baseUrl, payload, (writtenCount, total) => {
      process.stdout.write(`  [recommender] ${writtenCount}/${total}\r`);
    });
    console.log(`\n  [recommender] ${written} recipes updated`);
  }

  if (!skipFirestore) {
    console.log("\nWriting to Firestore...");
    const db = getFirestore();
    const BATCH_SIZE = 400;
    let written = 0;
    for (let i = 0; i < updated.length; i += BATCH_SIZE) {
      const chunk = updated.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const recipe of chunk) {
        batch.set(
          db.collection("recipes").doc(recipe.id),
          { nutrition: recipe.nutrition, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
      await batch.commit();
      written += chunk.length;
      process.stdout.write(`  [firestore]   ${written}/${updated.length}\r`);
    }
    console.log(`\n  [firestore]   ${written} recipes updated`);
  }

  if (isDryRun) console.log("\nDry run complete - nothing written.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
