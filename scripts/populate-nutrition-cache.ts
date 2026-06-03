#!/usr/bin/env bun
/**
 * Populate the OpenFoodFacts nutrition cache for every ingredient used by any
 * recipe.
 *
 * Reads the recipe list from the recommender, de-duplicates ingredient names,
 * looks each one up on OpenFoodFacts, and writes the result into the Firestore
 * `openFoodFactsNutritionCache` collection (the same cache the live
 * `deadlineFoodNutrition` function reads). Ingredients with no usable match are
 * cached as misses and listed in a .txt report.
 *
 * Run this BEFORE `recalc-nutrition.ts`.
 *
 * Usage:
 *   bun scripts/populate-nutrition-cache.ts [options]
 *
 * Options:
 *   --recommender-url <url>   Override RECOMMENDER_API_URL
 *   --delay <ms>              Delay between OpenFoodFacts requests (default 6500;
 *                             the search API is rate limited to ~10 req/min)
 *   --ttl-days <n>            Cache freshness for matches (default 90)
 *   --miss-ttl-days <n>       Cache freshness for misses (default 14)
 *   --unmatched-out <path>    Where to write the unmatched list
 *                             (default scripts/ingest/unmatched-ingredients.txt)
 *   --force                   Re-fetch even if an ingredient is already cached
 *   --dry-run                 Fetch + report but do not write the cache
 *
 * Environment variables:
 *   RECOMMENDER_API_URL, RECOMMENDER_API_KEY
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID, OPENFOODFACTS_BASE_URL, OPENFOODFACTS_USER_AGENT
 */

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import {
  cacheKeyForName,
  findProductForIngredient,
  readCachedProduct,
  writeCachedProduct,
} from "./ingest/openfoodfacts.ts";
import { listRecipes, recommenderUrl } from "./ingest/recommender.ts";

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
const delayMs = Number(option("--delay") ?? 6500);
const ttlMs = Number(option("--ttl-days") ?? 90) * 24 * 60 * 60 * 1000;
const missTtlMs = Number(option("--miss-ttl-days") ?? 14) * 24 * 60 * 60 * 1000;
const unmatchedOut = option("--unmatched-out") ?? "scripts/ingest/unmatched-ingredients.txt";
const baseUrl = recommenderUrl(option("--recommender-url"));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

function progress(done: number, total: number, name: string) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.floor(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  process.stdout.write(
    `  ${bar} ${String(pct).padStart(3)}% (${done}/${total}) ${name.slice(0, 35).padEnd(35)}\r`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Nutrition Cache Population ===");
  if (isDryRun) console.log("DRY RUN — cache will not be written");

  initFirebase();
  const db = getFirestore();

  console.log(`\nFetching recipes from ${baseUrl}…`);
  const recipes = await listRecipes(baseUrl);
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

  let matched = 0;
  let cachedHits = 0;
  const unmatched: string[] = [];
  let done = 0;

  for (const name of unique) {
    const cacheKey = cacheKeyForName(name);

    if (!force) {
      const cached = await readCachedProduct(db, cacheKey);
      if (cached !== undefined) {
        cachedHits++;
        if (cached === null) unmatched.push(name);
        else matched++;
        progress(++done, unique.length, name);
        continue;
      }
    }

    let product = null;
    try {
      product = await findProductForIngredient(name, async () => {
        await sleep(delayMs);
      });
    } catch (err) {
      console.error(`\n  [error] ${name}: ${(err as Error).message}`);
    }

    if (!isDryRun) {
      await writeCachedProduct(db, cacheKey, product, product ? ttlMs : missTtlMs);
    }

    if (product) matched++;
    else unmatched.push(name);

    progress(++done, unique.length, name);
  }

  process.stdout.write("\n");

  // Write the unmatched report.
  const header = `# ${unmatched.length} ingredient(s) with no OpenFoodFacts match — ${new Date().toISOString()}\n`;
  const body = unmatched.map((n) => n).sort((a, b) => a.localeCompare(b)).join("\n");
  await Bun.write(unmatchedOut, unmatched.length ? `${header}${body}\n` : header);

  console.log("\n=== Summary ===");
  console.log(`  unique ingredients   ${unique.length}`);
  console.log(`  matched              ${matched}`);
  console.log(`  unmatched            ${unmatched.length}`);
  console.log(`  already cached       ${cachedHits}${force ? " (ignored, --force)" : " (skipped)"}`);
  console.log(`  unmatched report     ${unmatchedOut}`);
  if (isDryRun) console.log("\nDry run complete — no cache written.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
