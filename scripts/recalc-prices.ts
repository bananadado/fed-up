#!/usr/bin/env bun
/**
 * Recompute recipe prices from stored ingredients.
 *
 * Run this after updating src/domain/ingredientPrices.ts from reviewed Tesco
 * proposals. It preserves existing recipe shapes and updates:
 *   - recommender price_pence
 *   - Firestore recipes/{id}.price
 *
 * Usage:
 *   bun scripts/recalc-prices.ts --dry-run
 *   bun scripts/recalc-prices.ts
 */

import { FieldValue } from "firebase-admin/firestore";

import { estimateStructuredPricePence } from "./ingest/prices.ts";
import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import { bulkUpsertRecipes, listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";

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

async function main() {
  console.log("=== Recipe Price Recalculation ===");
  if (isDryRun) console.log("DRY RUN — nothing will be written");

  if (!skipFirestore) initFirebase();
  const db = skipFirestore ? null : getFirestore();

  console.log(`\nFetching recipes from ${baseUrl}...`);
  const recipes = await listRecipes(baseUrl);
  console.log(`Fetched ${recipes.length} recipes`);

  const updated: RecipeOut[] = recipes.map((recipe) => ({
    ...recipe,
    price_pence: estimateStructuredPricePence(recipe.ingredients ?? []),
  }));

  const changed = updated.filter((recipe, index) => recipe.price_pence !== recipes[index]?.price_pence);
  console.log(`\nRecomputed ${updated.length} recipes (${changed.length} changed)`);

  for (const recipe of changed.slice(0, 20)) {
    const original = recipes.find((candidate) => candidate.id === recipe.id);
    console.log(`  ${recipe.id}: ${original?.price_pence ?? 0}p -> ${recipe.price_pence}p`);
  }
  if (changed.length > 20) console.log(`  ... ${changed.length - 20} more changed`);

  if (changed.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  if (!skipRecommender) {
    console.log("\nWriting to recommender API...");
    const payload = updated.map(({ difficulty: _difficulty, embedding_text: _embeddingText, ...recipe }) => recipe);
    const written = await bulkUpsertRecipes(baseUrl, payload, (writtenCount, total) => {
      process.stdout.write(`  [recommender] ${writtenCount}/${total}\r`);
    });
    console.log(`\n  [recommender] ${written} recipes updated`);
  }

  if (!skipFirestore) {
    if (!db) throw new Error("Firestore was not initialised.");
    console.log("\nWriting to Firestore...");
    const BATCH_SIZE = 400;
    let written = 0;
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const chunk = changed.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const recipe of chunk) {
        batch.set(
          db.collection("recipes").doc(recipe.id),
          {
            price: recipe.price_pence / 100,
            priceEstimateSource: {
              provider: "ingredient-price-table",
              label: "Ingredient price table estimate",
              fetchedAt: new Date().toISOString(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await batch.commit();
      written += chunk.length;
      process.stdout.write(`  [firestore]   ${written}/${changed.length}\r`);
    }
    console.log(`\n  [firestore]   ${written} recipes updated`);
  }

  if (isDryRun) console.log("\nDry run complete — nothing written.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
