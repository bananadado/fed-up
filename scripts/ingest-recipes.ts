#!/usr/bin/env bun
/**
 * Recipe ingestion script — TheMealDB → Firestore + pgvector recommender.
 *
 * Usage:
 *   bun scripts/ingest-recipes.ts [options]
 *
 * Options:
 *   --source themealdb          Data source (default: themealdb)
 *   --category <name>           Only ingest one category (e.g. "Chicken")
 *   --dry-run                   Fetch + normalise but do not write anywhere
 *   --no-firestore              Skip Firestore writes
 *   --no-recommender            Skip recommender API writes
 *   --recommender-url <url>     Override RECOMMENDER_API_URL env var
 *
 * Environment variables:
 *   RECOMMENDER_API_URL         Default: http://gru.end-pickerel.ts.net:8100
 *   RECOMMENDER_API_KEY         API key for the recommender (empty = no auth)
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64   Base64-encoded service account JSON
 *   GOOGLE_APPLICATION_CREDENTIALS    Path to service account JSON (alternative)
 *   FIREBASE_PROJECT_ID         Default: drp03-50059
 */

import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { fetchAllMeals } from "./ingest/sources/themealdb.ts";
import type { FirestoreMeal, RecipeIn } from "./ingest/types.ts";

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
const skipFirestore = flag("--no-firestore") || isDryRun;
const skipRecommender = flag("--no-recommender") || isDryRun;
const categoryFilter = option("--category");
const recommenderUrlOverride = option("--recommender-url");

// ── Config ─────────────────────────────────────────────────────────────────

const RECOMMENDER_URL =
  recommenderUrlOverride ??
  process.env["RECOMMENDER_API_URL"] ??
  "http://gru.end-pickerel.ts.net:8100";

const RECOMMENDER_KEY = process.env["RECOMMENDER_API_KEY"] ?? "";
const FIREBASE_PROJECT_ID = process.env["FIREBASE_PROJECT_ID"] ?? "drp03-50059";
const BULK_CHUNK = 20;

// ── Firebase init ──────────────────────────────────────────────────────────

function initFirebase() {
  const b64 = process.env["FIREBASE_SERVICE_ACCOUNT_KEY_B64"];
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    initializeApp({ credential: cert(json), projectId: FIREBASE_PROJECT_ID });
    return;
  }
  if (process.env["GOOGLE_APPLICATION_CREDENTIALS"]) {
    initializeApp({ projectId: FIREBASE_PROJECT_ID });
    return;
  }
  throw new Error(
    "No Firebase credentials found.\n" +
      "Set FIREBASE_SERVICE_ACCOUNT_KEY_B64 (base64 service account JSON)\n" +
      "or GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON).",
  );
}

// ── Recommender API writes ─────────────────────────────────────────────────

async function postRecipesBulk(recipes: RecipeIn[]): Promise<number> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RECOMMENDER_KEY) headers["X-Deadline-Food-API-Key"] = RECOMMENDER_KEY;

  const res = await fetch(`${RECOMMENDER_URL}/recipes/bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify(recipes),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Recommender /recipes/bulk failed ${res.status}: ${body}`);
  }

  const result = (await res.json()) as unknown[];
  return result.length;
}

async function writeToRecommender(recipes: RecipeIn[]): Promise<void> {
  let written = 0;
  for (let i = 0; i < recipes.length; i += BULK_CHUNK) {
    const chunk = recipes.slice(i, i + BULK_CHUNK);
    const count = await postRecipesBulk(chunk);
    written += count;
    process.stdout.write(`  [recommender] ${written}/${recipes.length}\r`);
  }
  console.log(`  [recommender] ${written} recipes written`);
}

// ── Firestore writes ───────────────────────────────────────────────────────

async function writeToFirestore(meals: FirestoreMeal[]): Promise<void> {
  const db = getFirestore();
  const recipesRef = db.collection("recipes");
  const BATCH_SIZE = 400;

  let written = 0;
  for (let i = 0; i < meals.length; i += BATCH_SIZE) {
    const chunk = meals.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const meal of chunk) {
      // Strip client-only fields before writing
      const { reviews: _r, rating: _ra, ...content } = meal as FirestoreMeal & {
        reviews: never[];
        rating: number;
      };
      batch.set(
        recipesRef.doc(meal.id),
        { ...content, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
    process.stdout.write(`  [firestore]   ${written}/${meals.length}\r`);
  }
  console.log(`  [firestore]   ${written} recipes written`);
}

// ── Progress bar ──────────────────────────────────────────────────────────

function progress(done: number, total: number, name: string) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.floor(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  process.stdout.write(
    `  [fetch] ${bar} ${String(pct).padStart(3)}% (${done}/${total}) ${name.slice(0, 35)}\r`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Recipe Ingestion ===");
  if (isDryRun) console.log("DRY RUN — no writes will happen");

  if (!skipFirestore) initFirebase();

  console.log("\nFetching from TheMealDB…");
  const normalised = await fetchAllMeals({
    categories: categoryFilter ? [categoryFilter] : undefined,
    onProgress: progress,
  });
  console.log(`\nFetched ${normalised.length} recipes`);

  if (normalised.length === 0) {
    console.log("Nothing to ingest.");
    return;
  }

  if (isDryRun) {
    const sample = normalised[0]!;
    console.log("\nSample recipe (dry run):");
    console.log(JSON.stringify(sample.recipe, null, 2));
    console.log("\nDry run complete — no data written.");
    return;
  }

  if (!skipRecommender) {
    console.log("\nWriting to recommender API…");
    try {
      await writeToRecommender(normalised.map((n) => n.recipe));
    } catch (err) {
      console.error(`  [recommender] ERROR: ${(err as Error).message}`);
      console.error("  Continuing with Firestore…");
    }
  }

  if (!skipFirestore) {
    console.log("\nWriting to Firestore…");
    await writeToFirestore(normalised.map((n) => n.firestoreMeal));
  }

  // Summary by meal slot
  const bySlot = normalised.reduce<Record<string, number>>((acc, n) => {
    const key = n.recipe.meal_slots.join("/");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\n=== Summary ===");
  for (const [slot, count] of Object.entries(bySlot)) {
    console.log(`  ${slot.padEnd(20)} ${count}`);
  }
  console.log(`  ${"total".padEnd(20)} ${normalised.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
