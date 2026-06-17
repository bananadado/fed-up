#!/usr/bin/env bun
/**
 * Delete recipe orphans between Firestore and the pgvector recommender.
 *
 * This compares recipe IDs only. It does not inspect or reconcile field values.
 * A recipe is an orphan when it exists in Firestore but not the recommender, or
 * in the recommender but not Firestore. Dry-run is the default.
 *
 * Usage:
 *   bun scripts/sync-recipes.ts
 *   bun scripts/sync-recipes.ts --apply
 *   bun scripts/sync-recipes.ts --include-unpublished --apply
 *
 * Environment:
 *   RECOMMENDER_API_URL   default http://gru.end-pickerel.ts.net:8100
 *   RECOMMENDER_API_KEY   API key for the recommender API
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID   default drp03-50059
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import { listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";

type UnknownRecord = Record<string, unknown>;

type FirestoreRecipe = {
  id: string;
  docId: string;
  name: string;
  published: boolean | null;
};

type RecommenderRecipe = {
  id: string;
  name: string;
};

type Orphan = {
  id: string;
  name: string;
};

type DeleteFailure = {
  id: string;
  store: "firestore" | "recommender";
  error: string;
};

type SyncReport = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  recommenderUrl: string;
  includeUnpublished: boolean;
  counts: {
    firestore: number;
    firestoreCompared: number;
    firestoreUnpublishedExcluded: number;
    recommender: number;
    firestoreOnly: number;
    recommenderOnly: number;
    deletesPlanned: number;
  };
  firestoreOnly: Orphan[];
  recommenderOnly: Orphan[];
  applied?: {
    firestoreDeleted: number;
    recommenderDeleted: number;
    failures: DeleteFailure[];
  };
};

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function printUsage(): void {
  console.log(`Usage:
  bun scripts/sync-recipes.ts [options]

Options:
  --apply                Delete orphans. Default is report-only dry run.
  --include-unpublished  Include Firestore docs where published === false.
  --recommender-url URL  Override RECOMMENDER_API_URL.
  --report PATH          Write JSON report. Default: tmp/recipe-sync-report.json.
  --help                 Show this help.
`);
}

if (flag("--help") || flag("-h")) {
  printUsage();
  process.exit(0);
}

const isDryRun = !flag("--apply");
const includeUnpublished = flag("--include-unpublished");
const reportPath = option("--report") ?? "tmp/recipe-sync-report.json";
const baseUrl = recommenderUrl(option("--recommender-url"));
const recommenderKey = process.env["RECOMMENDER_API_KEY"] ?? "";
const batchSize = 400;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recipeName(data: UnknownRecord, fallback: string): string {
  return asText(data.name) || fallback;
}

function recommenderHeaders(): Record<string, string> {
  return recommenderKey ? { "X-Deadline-Food-API-Key": recommenderKey } : {};
}

async function fetchFirestoreRecipes(): Promise<FirestoreRecipe[]> {
  const snapshot = await getFirestore().collection("recipes").get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as UnknownRecord;
      return {
        id: asText(data.id) || doc.id,
        docId: doc.id,
        name: recipeName(data, doc.id),
        published: typeof data.published === "boolean" ? data.published : null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchRecommenderRecipes(): Promise<RecommenderRecipe[]> {
  const recipes = await listRecipes(baseUrl);
  return recipes
    .map((recipe: RecipeOut) => ({
      id: recipe.id,
      name: recipe.name || recipe.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueById<T extends { id: string }>(items: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (!result.has(item.id)) result.set(item.id, item);
  }
  return result;
}

function findOrphans(
  firestoreRecipes: FirestoreRecipe[],
  recommenderRecipes: RecommenderRecipe[],
): { firestoreOnly: Orphan[]; recommenderOnly: Orphan[] } {
  const firestoreById = uniqueById(firestoreRecipes);
  const recommenderById = uniqueById(recommenderRecipes);

  const firestoreOnly = [...firestoreById.values()]
    .filter((recipe) => !recommenderById.has(recipe.id))
    .map(({ id, name }) => ({ id, name }));

  const recommenderOnly = [...recommenderById.values()]
    .filter((recipe) => !firestoreById.has(recipe.id))
    .map(({ id, name }) => ({ id, name }));

  return { firestoreOnly, recommenderOnly };
}

async function deleteFirestoreOrphans(
  firestoreById: Map<string, FirestoreRecipe>,
  orphans: Orphan[],
): Promise<{ deleted: number; failures: DeleteFailure[] }> {
  const db = getFirestore();
  const recipesRef = db.collection("recipes");
  const failures: DeleteFailure[] = [];
  let deleted = 0;

  for (let i = 0; i < orphans.length; i += batchSize) {
    const chunk = orphans.slice(i, i + batchSize);
    const batch = db.batch();
    for (const orphan of chunk) {
      const recipe = firestoreById.get(orphan.id);
      if (!recipe) continue;
      batch.delete(recipesRef.doc(recipe.docId));
    }
    try {
      await batch.commit();
      deleted += chunk.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const orphan of chunk) {
        failures.push({ id: orphan.id, store: "firestore", error: message });
      }
    }
    process.stdout.write(`  [firestore] ${deleted + failures.length}/${orphans.length}\r`);
  }

  console.log(`\n  [firestore] ${deleted} deleted, ${failures.length} failed`);
  return { deleted, failures };
}

async function deleteRecommenderOrphans(orphans: Orphan[]): Promise<{ deleted: number; failures: DeleteFailure[] }> {
  const failures: DeleteFailure[] = [];
  let deleted = 0;

  for (const orphan of orphans) {
    try {
      const res = await fetch(`${baseUrl}/recipes/${encodeURIComponent(orphan.id)}`, {
        method: "DELETE",
        headers: recommenderHeaders(),
      });
      if (res.status === 204 || res.status === 404) {
        deleted++;
      } else {
        const body = await res.text().catch(() => "");
        failures.push({
          id: orphan.id,
          store: "recommender",
          error: `DELETE /recipes/${orphan.id} failed ${res.status}: ${body}`,
        });
      }
    } catch (error) {
      failures.push({
        id: orphan.id,
        store: "recommender",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.stdout.write(`  [recommender] ${deleted + failures.length}/${orphans.length}\r`);
  }

  console.log(`\n  [recommender] ${deleted} deleted, ${failures.length} failed`);
  return { deleted, failures };
}

async function writeReport(report: SyncReport): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printSummary(report: SyncReport): void {
  console.log("\n=== Recipe orphan report ===");
  console.log(`Mode: ${report.mode}`);
  console.log(`Recommender: ${report.recommenderUrl}`);
  console.log(`Firestore recipes: ${report.counts.firestore}`);
  console.log(`Firestore compared: ${report.counts.firestoreCompared}`);
  if (!includeUnpublished) {
    console.log(`Firestore unpublished excluded: ${report.counts.firestoreUnpublishedExcluded}`);
  }
  console.log(`Recommender recipes: ${report.counts.recommender}`);
  console.log(`Firestore-only: ${report.counts.firestoreOnly}`);
  console.log(`Recommender-only: ${report.counts.recommenderOnly}`);

  const examples = [
    ...report.firestoreOnly.map((item) => ({ ...item, store: "firestore-only" })),
    ...report.recommenderOnly.map((item) => ({ ...item, store: "recommender-only" })),
  ].slice(0, 20);

  if (examples.length > 0) {
    console.log("\nExamples:");
    for (const item of examples) {
      console.log(`  ${item.store}: ${item.id} - ${item.name}`);
    }
    const total = report.counts.firestoreOnly + report.counts.recommenderOnly;
    if (total > examples.length) console.log(`  ... and ${total - examples.length} more. See ${reportPath}`);
  }

  console.log(`\nReport written to ${reportPath}`);
}

async function main(): Promise<void> {
  console.log("=== Recipe orphan sync ===");
  if (isDryRun) console.log("DRY RUN - no deletes will happen. Pass --apply to delete orphans.");
  if (!includeUnpublished) {
    console.log("Firestore recipes with published === false are excluded; pass --include-unpublished to include them.");
  }

  initFirebase();
  console.log(`Fetching Firestore recipes and recommender recipes from ${baseUrl}...`);
  const [allFirestoreRecipes, recommenderRecipes] = await Promise.all([
    fetchFirestoreRecipes(),
    fetchRecommenderRecipes(),
  ]);

  const comparedFirestoreRecipes = includeUnpublished
    ? allFirestoreRecipes
    : allFirestoreRecipes.filter((recipe) => recipe.published !== false);

  const { firestoreOnly, recommenderOnly } = findOrphans(comparedFirestoreRecipes, recommenderRecipes);

  const report: SyncReport = {
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? "dry-run" : "apply",
    recommenderUrl: baseUrl,
    includeUnpublished,
    counts: {
      firestore: allFirestoreRecipes.length,
      firestoreCompared: comparedFirestoreRecipes.length,
      firestoreUnpublishedExcluded: allFirestoreRecipes.length - comparedFirestoreRecipes.length,
      recommender: recommenderRecipes.length,
      firestoreOnly: firestoreOnly.length,
      recommenderOnly: recommenderOnly.length,
      deletesPlanned: firestoreOnly.length + recommenderOnly.length,
    },
    firestoreOnly,
    recommenderOnly,
  };

  printSummary(report);

  if (isDryRun) {
    await writeReport(report);
    console.log("\nDry run complete - no data deleted.");
    return;
  }

  if (firestoreOnly.length === 0 && recommenderOnly.length === 0) {
    await writeReport(report);
    console.log("\nNo orphans found.");
    return;
  }

  const firestoreById = uniqueById(comparedFirestoreRecipes);
  const firestoreResult = await deleteFirestoreOrphans(firestoreById, firestoreOnly);
  const recommenderResult = await deleteRecommenderOrphans(recommenderOnly);

  report.applied = {
    firestoreDeleted: firestoreResult.deleted,
    recommenderDeleted: recommenderResult.deleted,
    failures: [...firestoreResult.failures, ...recommenderResult.failures],
  };
  await writeReport(report);

  if (report.applied.failures.length > 0) {
    console.error(`\nCompleted with ${report.applied.failures.length} failure(s). See ${reportPath}.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
