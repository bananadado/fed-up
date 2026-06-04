#!/usr/bin/env bun
/**
 * Delete every document in the Firestore `openFoodFactsNutritionCache`
 * collection (the cache shared by the ingestion scripts and the live
 * `deadlineFoodNutrition` function).
 *
 * Use this before re-populating the cache from a different source — e.g. after
 * switching the nutrition pipeline to USDA, so stale OpenFoodFacts misses are
 * not served from cache. After clearing, run:
 *   bun scripts/populate-nutrition-cache.ts
 *   bun scripts/recalc-nutrition.ts
 *
 * Usage:
 *   bun scripts/clear-nutrition-cache.ts [--dry-run]
 *
 * Environment variables:
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID
 */

import { initFirebase, getFirestore } from "./ingest/firebase.ts";

const CACHE_COLLECTION = "openFoodFactsNutritionCache";
const BATCH_SIZE = 400;

const isDryRun = process.argv.slice(2).includes("--dry-run");

async function main() {
  console.log("=== Clear Nutrition Cache ===");
  if (isDryRun) console.log("DRY RUN — nothing will be deleted");

  initFirebase();
  const db = getFirestore();
  const collection = db.collection(CACHE_COLLECTION);

  let deleted = 0;
  // Page through with a limit query so we never hold the whole collection in
  // memory; each committed batch shrinks the remaining set.
  for (;;) {
    const snapshot = await collection.limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    if (isDryRun) {
      deleted += snapshot.size;
      console.log(`  would delete ${deleted} so far…`);
      // In dry-run we cannot delete, so stop after counting the first page to
      // avoid an infinite loop.
      const total = (await collection.count().get()).data().count;
      console.log(`  collection holds ${total} document(s)`);
      break;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += snapshot.size;
    process.stdout.write(`  deleted ${deleted}\r`);
  }

  process.stdout.write("\n");
  console.log(`\n=== Done — ${isDryRun ? "would delete" : "deleted"} ${deleted} document(s) ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
