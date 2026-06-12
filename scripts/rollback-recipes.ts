#!/usr/bin/env bun
/**
 * Restore recipe data from a snapshot taken by scripts/backup-recipes.ts —
 * the inverse of scripts/patch-ingredient-measures.ts.
 *
 *   • Recommender: re-upserts each backed-up recipe via POST /recipes/bulk,
 *     restoring every field (including ingredients) to the snapshot. (Difficulty
 *     and embedding are recomputed idempotently from the restored text.)
 *   • Firestore:   merge-sets ONLY the `ingredients` field from the snapshot —
 *     the precise inverse of what the patch changed, leaving everything else
 *     (cost, servings, nutrition, …) alone.
 *
 * Usage:
 *   bun scripts/rollback-recipes.ts --dry-run               # report only
 *   bun scripts/rollback-recipes.ts                         # use latest snapshot
 *   bun scripts/rollback-recipes.ts --stamp 2026-06-12T...  # a specific snapshot
 *   bun scripts/rollback-recipes.ts --no-firestore
 *
 * Env: identical to backup-recipes.ts.
 *
 * ── Full physical Postgres backup/restore (belt & braces) ──────────────────
 * The recommender DB is server-only. For a complete dump (incl. embeddings and
 * timestamps), run on gru:
 *   docker exec drp03-db pg_dump -U recommender -t recipes recommender \
 *     > recipes-$(date +%F).sql
 * Restore with:
 *   docker exec -i drp03-db psql -U recommender recommender < recipes-YYYY-MM-DD.sql
 * (Container name may differ — check `docker ps`. `pg_dump -t recipes` dumps the
 * recipes table only; drop `-t recipes` for the whole DB.)
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

type Ingredient = { name: string; quantity: number; unit: string; preparation?: string };
type Recipe = { id: string; ingredients: Ingredient[]; [key: string]: unknown };
type FirestoreDoc = { id: string; data: { ingredients?: Ingredient[]; [key: string]: unknown } };

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const isDryRun = flag("--dry-run");
const skipFirestore = flag("--no-firestore");
const skipRecommender = flag("--no-recommender");
const dir = option("--dir") ?? "backups";
const RECOMMENDER_URL = (
  option("--recommender-url") ?? process.env["RECOMMENDER_API_URL"] ?? "http://gru.end-pickerel.ts.net:8100"
).replace(/\/$/, "");
const RECOMMENDER_KEY = process.env["RECOMMENDER_API_KEY"] ?? "";
const FIREBASE_PROJECT_ID = process.env["FIREBASE_PROJECT_ID"] ?? "drp03-50059";
const BULK_CHUNK = 25;

function recommenderHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RECOMMENDER_KEY) headers["X-Deadline-Food-API-Key"] = RECOMMENDER_KEY;
  return headers;
}

function initFirebase(): void {
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
    "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_KEY_B64 or " +
      "GOOGLE_APPLICATION_CREDENTIALS (or pass --no-firestore).",
  );
}

async function resolveStamp(): Promise<string> {
  const explicit = option("--stamp");
  if (explicit) return explicit;
  const latest = (await readFile(join(dir, "latest.txt"), "utf8").catch(() => "")).trim();
  if (!latest) {
    throw new Error(`No --stamp given and ${join(dir, "latest.txt")} not found. Run backup-recipes.ts first.`);
  }
  return latest;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function rollbackRecommender(stamp: string): Promise<void> {
  const path = join(dir, `recommender-${stamp}.json`);
  const recipes = await readJsonFile<Recipe[]>(path);
  if (!recipes) {
    console.log(`  [recommender] no snapshot at ${path} — skipped`);
    return;
  }
  console.log(`  [recommender] restoring ${recipes.length} recipes from ${path}`);
  if (isDryRun) return;

  let written = 0;
  for (let i = 0; i < recipes.length; i += BULK_CHUNK) {
    const chunk = recipes.slice(i, i + BULK_CHUNK).map((recipe) => {
      const rest: Record<string, unknown> = { ...recipe };
      delete rest["difficulty"];
      delete rest["embedding_text"];
      return rest;
    });
    const res = await fetch(`${RECOMMENDER_URL}/recipes/bulk`, {
      method: "POST",
      headers: recommenderHeaders(),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`POST /recipes/bulk failed ${res.status}: ${body}`);
    }
    written += chunk.length;
    process.stdout.write(`  [recommender] ${written}/${recipes.length}\r`);
  }
  console.log(`  [recommender] ${written} recipes restored`);
}

async function rollbackFirestore(stamp: string): Promise<void> {
  const path = join(dir, `firestore-${stamp}.json`);
  const docs = await readJsonFile<FirestoreDoc[]>(path);
  if (!docs) {
    console.log(`  [firestore]   no snapshot at ${path} — skipped`);
    return;
  }
  const withIngredients = docs.filter((d) => Array.isArray(d.data?.ingredients));
  console.log(`  [firestore]   restoring ingredients for ${withIngredients.length} recipes from ${path}`);
  if (isDryRun) return;

  initFirebase();
  const db = getFirestore();
  const recipesRef = db.collection("recipes");
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < withIngredients.length; i += BATCH_SIZE) {
    const chunk = withIngredients.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.set(
        recipesRef.doc(doc.id),
        { ingredients: doc.data.ingredients, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
    process.stdout.write(`  [firestore]   ${written}/${withIngredients.length}\r`);
  }
  console.log(`  [firestore]   ${written} recipes restored`);
}

async function main(): Promise<void> {
  console.log("=== Recipe rollback ===");
  if (isDryRun) console.log("DRY RUN — no writes will happen");
  const stamp = await resolveStamp();
  console.log(`Using snapshot stamp: ${stamp}`);

  if (!skipRecommender) await rollbackRecommender(stamp);
  if (!skipFirestore) await rollbackFirestore(stamp);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
