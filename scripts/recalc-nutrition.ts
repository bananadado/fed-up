#!/usr/bin/env bun
/**
 * Recompute every recipe's nutrition from the OpenFoodFacts cache.
 *
 * For each recipe, every ingredient is matched against the cached OpenFoodFacts
 * product (populated by `populate-nutrition-cache.ts`), scaled to the recipe's
 * own quantity/unit, and summed. The result — with a provenance `source` block
 * listing matched and missing ingredients — is written back to:
 *   • the recommender (POST /recipes/bulk, preserving all other fields)
 *   • Firestore recipes/{id} (merge, including the source block)
 *
 * Recipes where no ingredient matched are left untouched and reported.
 *
 * Run this AFTER `populate-nutrition-cache.ts`.
 *
 * Usage:
 *   bun scripts/recalc-nutrition.ts [options]
 *
 * Options:
 *   --recommender-url <url>   Override RECOMMENDER_API_URL
 *   --no-recommender          Skip the recommender re-upsert
 *   --no-firestore            Skip the Firestore nutrition write
 *   --dry-run                 Compute + report but write nothing
 *
 * Environment variables:
 *   RECOMMENDER_API_URL, RECOMMENDER_API_KEY
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID
 */

import { FieldValue } from "firebase-admin/firestore";

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import {
  cacheKeyForName,
  estimateIngredientNutrition,
  readCachedProduct,
  totalNutritionFromEstimates,
  type IngredientNutritionEstimate,
  type OpenFoodFactsProduct,
} from "./ingest/openfoodfacts.ts";
import { bulkUpsertRecipes, listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";

// ── CLI args ───────────────────────────────────────────────────────────────

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
const baseUrl = recommenderUrl(option("--recommender-url"));

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Recipe Nutrition Recalculation ===");
  if (isDryRun) console.log("DRY RUN — nothing will be written");

  initFirebase();
  const db = getFirestore();

  console.log(`\nFetching recipes from ${baseUrl}…`);
  const recipes = await listRecipes(baseUrl);
  console.log(`Fetched ${recipes.length} recipes`);

  // Load every needed cache entry once, keyed by normalised ingredient name.
  const keys = new Set<string>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients ?? []) {
      if (ingredient.name?.trim()) keys.add(cacheKeyForName(ingredient.name));
    }
  }
  console.log(`Loading ${keys.size} cached ingredients…`);
  const cache = new Map<string, OpenFoodFactsProduct | null>();
  for (const key of keys) {
    cache.set(key, (await readCachedProduct(db, key)) ?? null);
  }

  const updated: RecipeOut[] = [];
  let skippedNoMatch = 0;

  for (const recipe of recipes) {
    const ingredients = recipe.ingredients ?? [];
    const estimates: IngredientNutritionEstimate[] = [];
    const missing: string[] = [];

    for (const ingredient of ingredients) {
      const name = ingredient.name?.trim();
      if (!name) continue;
      const product = cache.get(cacheKeyForName(name));
      const estimate = product ? estimateIngredientNutrition(ingredient, product) : null;
      if (estimate) estimates.push(estimate);
      else missing.push(name);
    }

    if (estimates.length === 0) {
      skippedNoMatch++;
      continue;
    }

    const nutrition = totalNutritionFromEstimates(estimates, missing);
    updated.push({ ...recipe, nutrition });
  }

  console.log(
    `\nRecomputed ${updated.length} recipes (${skippedNoMatch} left untouched — no matched ingredients)`,
  );

  if (updated.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  if (!skipRecommender) {
    console.log("\nWriting to recommender API…");
    // RecipeIn ignores the derived fields; drop them so we send a clean payload.
    const payload = updated.map(({ difficulty: _d, embedding_text: _e, ...recipe }) => recipe);
    const written = await bulkUpsertRecipes(baseUrl, payload, (w, t) => {
      process.stdout.write(`  [recommender] ${w}/${t}\r`);
    });
    console.log(`\n  [recommender] ${written} recipes updated`);
  }

  if (!skipFirestore) {
    console.log("\nWriting to Firestore…");
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

  console.log("\n=== Summary ===");
  console.log(`  recipes total        ${recipes.length}`);
  console.log(`  recomputed           ${updated.length}`);
  console.log(`  left untouched       ${skippedNoMatch}`);
  if (isDryRun) console.log("\nDry run complete — nothing written.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
