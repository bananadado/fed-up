#!/usr/bin/env bun
/**
 * Populate the nutrition cache for every ingredient used by any recipe.
 *
 * Reads the recipe list from Firestore by default, de-duplicates ingredient names,
 * looks each one up on USDA FoodData Central, and writes the result into the
 * Firestore `openFoodFactsNutritionCache` collection (the same cache the live
 * `deadlineFoodNutrition` function reads). Each cached product is tagged with
 * its `provider`. Ingredients neither USDA nor OpenFoodFacts can match are
 * cached as misses and listed in a .txt report.
 *
 * OpenFoodFacts fallback is ON by default because this script is a cache
 * backfill/review tool. Run with --no-openfoodfacts if you only want USDA.
 *
 * Run this BEFORE `recalc-nutrition.ts`.
 *
 * Usage:
 *   bun scripts/populate-nutrition-cache.ts [options]
 *
 * Options:
 *   --source <name>           firestore | recommender | both (default firestore)
 *   --recommender-url <url>   Override RECOMMENDER_API_URL
 *   --no-openfoodfacts        Do not fall back to OpenFoodFacts for USDA misses
 *   --openfoodfacts           Deprecated no-op; fallback is now on by default
 *   --delay <ms>              Delay between OpenFoodFacts requests (default 6500;
 *                             only used with --openfoodfacts)
 *   --usda-delay <ms>         Delay between USDA requests (default 1100; the FDC
 *                             gateway throttles to ~1 req/sec)
 *   --ttl-days <n>            Cache freshness for matches (default 90)
 *   --miss-ttl-days <n>       Cache freshness for misses (default 14)
 *   --unmatched-out <path>    Where to write the unmatched list
 *                             (default scripts/ingest/unmatched-ingredients.txt)
 *   --force                   Re-fetch even if an ingredient is already cached
 *   --dry-run                 Fetch + report but do not write the cache
 *
 * Environment variables:
 *   RECOMMENDER_API_URL, RECOMMENDER_API_KEY
 *   USDA_API_KEY (signed key recommended; DEMO_KEY is ~10 req/hour)
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID, OPENFOODFACTS_BASE_URL, OPENFOODFACTS_USER_AGENT
 */

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import {
  cacheKeyForName,
  curatedNutritionProductForIngredient,
  estimateIngredientNutrition,
  readCachedProduct,
  writeCachedProduct,
} from "./ingest/openfoodfacts.ts";
import { listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";
import { resolveIngredientProduct } from "./ingest/resolve.ts";
import type { Ingredient } from "./ingest/types.ts";
import { USDA_API_KEY } from "./ingest/usda.ts";

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
const force = flag("--force");
const useOpenFoodFacts = !flag("--no-openfoodfacts");
const delayMs = Number(option("--delay") ?? 6500);
const usdaDelayMs = Number(option("--usda-delay") ?? 1100);
const ttlMs = Number(option("--ttl-days") ?? 90) * 24 * 60 * 60 * 1000;
const missTtlMs = Number(option("--miss-ttl-days") ?? 14) * 24 * 60 * 60 * 1000;
const unmatchedOut = option("--unmatched-out") ?? "scripts/ingest/unmatched-ingredients.txt";
const baseUrl = recommenderUrl(option("--recommender-url"));
const recipeSource = option("--source") ?? "firestore";

type IngredientRecipe = {
  id: string;
  ingredients: Ingredient[];
};

function progress(done: number, total: number, name: string) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.floor(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  process.stdout.write(
    `  ${bar} ${String(pct).padStart(3)}% (${done}/${total}) ${name.slice(0, 35).padEnd(35)}\r`,
  );
}

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

async function listFirestoreRecipes(): Promise<IngredientRecipe[]> {
  const snapshot = await getFirestore().collection("recipes").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: typeof data.id === "string" ? data.id : doc.id,
      ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter(isIngredient) : [],
    };
  });
}

async function listIngredientRecipes(): Promise<IngredientRecipe[]> {
  if (!["firestore", "recommender", "both"].includes(recipeSource)) {
    throw new Error("--source must be firestore, recommender, or both");
  }

  const recipesById = new Map<string, IngredientRecipe>();

  if (recipeSource === "firestore" || recipeSource === "both") {
    const recipes = await listFirestoreRecipes();
    for (const recipe of recipes) recipesById.set(recipe.id, recipe);
  }

  if (recipeSource === "recommender" || recipeSource === "both") {
    const recipes: RecipeOut[] = await listRecipes(baseUrl);
    for (const recipe of recipes) {
      recipesById.set(recipe.id, {
        id: recipe.id,
        ingredients: recipe.ingredients ?? [],
      });
    }
  }

  return [...recipesById.values()];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `=== Nutrition Cache Population (${useOpenFoodFacts ? "USDA → OpenFoodFacts" : "USDA only"}) ===`,
  );
  if (isDryRun) console.log("DRY RUN — cache will not be written");
  if (USDA_API_KEY === "DEMO_KEY") {
    console.warn(
      "⚠ USDA_API_KEY is unset — using DEMO_KEY (~10 req/hour). " +
        "Set a signed key (https://fdc.nal.usda.gov/api-key-signup.html) before a bulk run.",
    );
  }

  initFirebase();
  const db = getFirestore();

  console.log(`\nFetching recipes from ${recipeSource}${recipeSource !== "firestore" ? ` (${baseUrl})` : ""}…`);
  const recipes = await listIngredientRecipes();
  console.log(`Fetched ${recipes.length} recipes`);

  // Unique ingredient names, keyed by their normalised cache key.
  const byKey = new Map<string, string>();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients ?? []) {
      const name = ingredient.name?.trim();
      if (!name) continue;
      const key = cacheKeyForName(name);
      if (!byKey.has(key)) byKey.set(key, name);
    }
  }

  const unique = [...byKey.values()].sort((a, b) => a.localeCompare(b));
  console.log(`Found ${unique.length} unique ingredients\n`);

  let matchedUsda = 0;
  let matchedOff = 0;
  let curatedMatches = 0;
  let cachedHits = 0;
  const unmatched: string[] = [];
  const errors: string[] = [];
  let done = 0;

  for (const name of unique) {
    const cacheKey = cacheKeyForName(name);
    const curated = curatedNutritionProductForIngredient(name);

    if (curated) {
      if (!isDryRun) {
        await writeCachedProduct(db, cacheKey, curated, ttlMs);
      }
      curatedMatches++;
      matchedUsda++;
      progress(++done, unique.length, name);
      continue;
    }

    if (!force) {
      const cached = await readCachedProduct(db, cacheKey);
      if (cached !== undefined) {
        const isUsable =
          cached === null ||
          estimateIngredientNutrition({ name, quantity: 100, unit: "g" }, cached) !== null;
        if (isUsable) {
          cachedHits++;
          if (cached === null) unmatched.push(name);
          else if (cached.provider === "USDA") matchedUsda++;
          else matchedOff++;
          progress(++done, unique.length, name);
          continue;
        }
      }
    }

    let product = null;
    let errored = false;
    try {
      ({ product } = await resolveIngredientProduct(name, {
        usdaMs: usdaDelayMs,
        offMs: delayMs,
        useOpenFoodFacts,
      }));
    } catch (err) {
      // Transient upstream failure — leave the ingredient uncached so a re-run
      // retries it, rather than poisoning the cache with a false miss.
      errored = true;
      errors.push(name);
      console.error(`\n  [retry-later] ${name}: ${(err as Error).message}`);
    }

    if (errored) {
      progress(++done, unique.length, name);
      continue;
    }

    if (!isDryRun) {
      await writeCachedProduct(db, cacheKey, product, product ? ttlMs : missTtlMs);
    }

    if (product?.provider === "USDA") matchedUsda++;
    else if (product) matchedOff++;
    else unmatched.push(name);

    progress(++done, unique.length, name);
  }

  process.stdout.write("\n");

  // Write the unmatched report.
  const sources = useOpenFoodFacts ? "USDA/OpenFoodFacts" : "USDA";
  const header = `# ${unmatched.length} ingredient(s) with no ${sources} match — ${new Date().toISOString()}\n`;
  const body = unmatched.map((n) => n).sort((a, b) => a.localeCompare(b)).join("\n");
  await Bun.write(unmatchedOut, unmatched.length ? `${header}${body}\n` : header);

  console.log("\n=== Summary ===");
  console.log(`  unique ingredients   ${unique.length}`);
  console.log(`  curated overrides    ${curatedMatches}`);
  console.log(`  matched (USDA)       ${matchedUsda}`);
  if (useOpenFoodFacts) console.log(`  matched (OFF)        ${matchedOff}`);
  console.log(`  unmatched            ${unmatched.length}`);
  console.log(`  errors (uncached)    ${errors.length}${errors.length ? " — re-run to retry" : ""}`);
  console.log(`  already cached       ${cachedHits}${force ? " (ignored, --force)" : " (skipped)"}`);
  console.log(`  unmatched report     ${unmatchedOut}`);
  if (isDryRun) console.log("\nDry run complete — no cache written.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
