#!/usr/bin/env bun
/**
 * Snapshot recipe data from the recommender DB and/or Firestore before applying
 * a patch, so it can be rolled back with scripts/rollback-recipes.ts.
 *
 * Writes timestamped JSON snapshots into ./backups (override with --dir):
 *   backups/recommender-<stamp>.json   full RecipeOut[] from GET /recipes
 *   backups/firestore-<stamp>.json     [{ id, data }] from the recipes collection
 * Both files share the same <stamp> so rollback can pair them. The latest stamp
 * is also recorded in backups/latest.txt.
 *
 * This is a logical snapshot of recipe records (sufficient to roll back the
 * ingredient patch). For a full physical Postgres backup see the pg_dump note
 * in scripts/rollback-recipes.ts.
 *
 * Usage:
 *   bun scripts/backup-recipes.ts
 *   bun scripts/backup-recipes.ts --no-firestore
 *   bun scripts/backup-recipes.ts --dir /path/to/backups
 *
 * Env (same as ingest):
 *   RECOMMENDER_API_URL   default http://gru.end-pickerel.ts.net:8100
 *   RECOMMENDER_API_KEY   required for the recommender snapshot
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID   default drp03-50059
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const skipFirestore = flag("--no-firestore");
const skipRecommender = flag("--no-recommender");
const dir = option("--dir") ?? "backups";
const RECOMMENDER_URL = (
  option("--recommender-url") ?? process.env["RECOMMENDER_API_URL"] ?? "http://gru.end-pickerel.ts.net:8100"
).replace(/\/$/, "");
const RECOMMENDER_KEY = process.env["RECOMMENDER_API_KEY"] ?? "";
const FIREBASE_PROJECT_ID = process.env["FIREBASE_PROJECT_ID"] ?? "drp03-50059";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

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

// Convert Firestore Timestamps to a readable ISO string so the snapshot is
// plain JSON. Rollback only reads `ingredients`, so this is purely for fidelity.
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    return { __timestamp__: (value as { toDate: () => Date }).toDate().toISOString() };
  }
  return value;
}

async function backupRecommender(stampStr: string): Promise<void> {
  const res = await fetch(`${RECOMMENDER_URL}/recipes`, { headers: recommenderHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET /recipes failed ${res.status}: ${body}`);
  }
  const recipes = (await res.json()) as unknown[];
  const file = join(dir, `recommender-${stampStr}.json`);
  await writeFile(file, JSON.stringify(recipes, null, 2));
  console.log(`  [recommender] ${recipes.length} recipes → ${file}`);
}

async function backupFirestore(stampStr: string): Promise<void> {
  initFirebase();
  const db = getFirestore();
  const snap = await db.collection("recipes").get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  const file = join(dir, `firestore-${stampStr}.json`);
  await writeFile(file, JSON.stringify(docs, jsonReplacer, 2));
  console.log(`  [firestore]   ${docs.length} recipes → ${file}`);
}

async function main(): Promise<void> {
  console.log("=== Recipe backup ===");
  await mkdir(dir, { recursive: true });
  const stampStr = stamp();

  if (!skipRecommender) await backupRecommender(stampStr);
  if (!skipFirestore) await backupFirestore(stampStr);

  await writeFile(join(dir, "latest.txt"), stampStr);
  console.log(`\nSnapshot stamp: ${stampStr}`);
  console.log(`Roll back with: bun scripts/rollback-recipes.ts --stamp ${stampStr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
