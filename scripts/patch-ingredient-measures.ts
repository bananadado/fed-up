#!/usr/bin/env bun
/**
 * Patch corrupted ingredient measures in already-ingested recipes (#251 follow-up).
 *
 * Background
 * ──────────
 * The ingest parser used to drop bare fractions: "1/2 cup" became
 * { quantity: 1, unit: "item" } because the leading "\d+" matched just the "1"
 * and swallowed the "/2" *and* the unit. The fix lives in
 * src/domain/ingredientMeasurements.ts, but the original measure strings were
 * stripped before storage (themealdb.ts discards `originalMeasure`), so the
 * corrupted rows cannot be repaired from the DB alone — a "1 item" is
 * indistinguishable from a legitimately-parsed "1 item". The only source of
 * truth left is TheMealDB itself, reachable by the recipe's stable `tmdb-{id}`.
 *
 * What this does (and deliberately does NOT do)
 * ─────────────────────────────────────────────
 * It re-fetches ONLY the raw ingredient/measure pairs from TheMealDB by id,
 * re-parses them with the fixed parser, and writes the corrected `ingredients`
 * array back. It does NOT re-estimate cost (price_pence), prep time, nutrition,
 * allergens, tags, difficulty inputs or anything else — those expensive fields
 * are preserved verbatim:
 *   • Recommender: GET the full recipe, replace ONLY `ingredients`, POST it back.
 *     create_recipe recomputes difficulty/embedding idempotently from unchanged
 *     text and keeps price_pence etc. because we send the existing values.
 *   • Firestore:   merge-set ONLY the `ingredients` field on recipes/{id}.
 * Only recipes whose ingredients actually change are written. Non-TheMealDB
 * recipes (e.g. user-created `custom-*`) are skipped — they never went through
 * this parser and are unaffected.
 *
 * Usage
 * ─────
 *   bun scripts/patch-ingredient-measures.ts --dry-run     # report only, no writes
 *   bun scripts/patch-ingredient-measures.ts               # apply to both stores
 *   bun scripts/patch-ingredient-measures.ts --no-firestore
 *   bun scripts/patch-ingredient-measures.ts --no-recommender
 *   bun scripts/patch-ingredient-measures.ts --limit 5     # scan first 5 (smoke test)
 *
 * Env (identical to ingest):
 *   RECOMMENDER_API_URL   default http://gru.end-pickerel.ts.net:8100
 *   RECOMMENDER_API_KEY   required (used for both the read and the write)
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID   default drp03-50059
 */

import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { fetchMealDetail } from "./ingest/sources/themealdb.ts";
import { parseMeasureToIngredient } from "../src/domain/ingredientMeasurements.ts";
import { formatIngredient } from "../src/deadline-food/ingredients.ts";

type Ingredient = { name: string; quantity: number; unit: string; preparation?: string };
type Recipe = { id: string; name: string; ingredients: Ingredient[]; [key: string]: unknown };

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const isDryRun = flag("--dry-run");
const skipFirestore = flag("--no-firestore");
const skipRecommender = flag("--no-recommender");
const limit = option("--limit") ? Number(option("--limit")) : Number.POSITIVE_INFINITY;
const RECOMMENDER_URL = (
  option("--recommender-url") ??
  process.env["RECOMMENDER_API_URL"] ??
  "http://gru.end-pickerel.ts.net:8100"
).replace(/\/$/, "");
const RECOMMENDER_KEY = process.env["RECOMMENDER_API_KEY"] ?? "";
const FIREBASE_PROJECT_ID = process.env["FIREBASE_PROJECT_ID"] ?? "drp03-50059";
const FETCH_DELAY_MS = 150;
const BULK_CHUNK = 25;

function recommenderHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (RECOMMENDER_KEY) headers["X-Deadline-Food-API-Key"] = RECOMMENDER_KEY;
  return headers;
}

function tmdbId(recipeId: string): string | null {
  const match = /^tmdb-(\d+)$/.exec(recipeId);
  return match ? match[1]! : null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Re-derive the canonical ingredient array from TheMealDB's raw fields. */
function correctedIngredients(meal: Record<string, string | undefined>): Ingredient[] {
  const result: Ingredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) break;
    const measure = meal[`strMeasure${i}`]?.trim() ?? "";
    const parsed = parseMeasureToIngredient(name, measure);
    // Mirror exactly what ingest stores: { name, quantity, unit, preparation? }
    // (originalMeasure is discarded by ingest).
    result.push({
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      ...(parsed.preparation ? { preparation: parsed.preparation } : {}),
    });
  }
  return result;
}

/** Stable comparison key: ignores key order and float noise, keeps prep. */
function canonical(list: Ingredient[] | undefined): string {
  return JSON.stringify(
    (list ?? []).map((ing) => ({
      name: ing.name,
      quantity: Math.round((ing.quantity ?? 0) * 1000) / 1000,
      unit: ing.unit ?? "",
      ...(ing.preparation ? { preparation: ing.preparation } : {}),
    })),
  );
}

/** Render ingredients the way the app actually shows them, so dry-run diffs
 *  reflect real UI (e.g. a qty-1 "serving" shows as just the name, not
 *  "1 serving X"). */
function describe(list: Ingredient[]): string {
  return list.map((i) => formatIngredient(i)).join(", ");
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

async function fetchRecipes(): Promise<Recipe[]> {
  const res = await fetch(`${RECOMMENDER_URL}/recipes`, { headers: recommenderHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GET /recipes failed ${res.status}: ${body}\n` +
        (res.status === 401 || res.status === 403
          ? "Set RECOMMENDER_API_KEY (the same key the ingest uses)."
          : ""),
    );
  }
  return (await res.json()) as Recipe[];
}

type Change = { recipe: Recipe; corrected: Ingredient[] };

async function computeChanges(recipes: Recipe[]): Promise<Change[]> {
  const changes: Change[] = [];
  let scanned = 0;
  let skipped = 0;
  for (const recipe of recipes) {
    if (scanned >= limit) break;
    const id = tmdbId(recipe.id);
    if (!id) {
      skipped++;
      continue;
    }
    scanned++;
    const detail = await fetchMealDetail(id);
    await sleep(FETCH_DELAY_MS);
    if (!detail) {
      console.warn(`  ! ${recipe.id} (${recipe.name}): not found on TheMealDB — skipped`);
      continue;
    }
    const corrected = correctedIngredients(detail as unknown as Record<string, string | undefined>);
    if (canonical(corrected) === canonical(recipe.ingredients)) continue;
    changes.push({ recipe, corrected });
    process.stdout.write(`  scanned ${scanned}, changed ${changes.length}\r`);
  }
  console.log(
    `\nScanned ${scanned} TheMealDB recipes (skipped ${skipped} non-tmdb), ` +
      `${changes.length} need correction.`,
  );
  return changes;
}

async function writeRecommender(changes: Change[]): Promise<void> {
  let written = 0;
  for (let i = 0; i < changes.length; i += BULK_CHUNK) {
    const chunk = changes.slice(i, i + BULK_CHUNK);
    const payload = chunk.map(({ recipe, corrected }) => {
      // RecipeOut carries two read-only extras the write model (RecipeIn) doesn't
      // need; drop them and replace only the ingredients, preserving everything
      // else (price_pence, prep_minutes, nutrition, tags, …) verbatim.
      const rest: Record<string, unknown> = { ...recipe };
      delete rest["difficulty"];
      delete rest["embedding_text"];
      return { ...rest, ingredients: corrected };
    });
    const res = await fetch(`${RECOMMENDER_URL}/recipes/bulk`, {
      method: "POST",
      headers: recommenderHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`POST /recipes/bulk failed ${res.status}: ${body}`);
    }
    written += chunk.length;
    process.stdout.write(`  [recommender] ${written}/${changes.length}\r`);
  }
  console.log(`  [recommender] ${written} recipes patched`);
}

async function writeFirestore(changes: Change[]): Promise<void> {
  initFirebase();
  const db = getFirestore();
  const recipesRef = db.collection("recipes");
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const chunk = changes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { recipe, corrected } of chunk) {
      batch.set(
        recipesRef.doc(recipe.id),
        { ingredients: corrected, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
    process.stdout.write(`  [firestore]   ${written}/${changes.length}\r`);
  }
  console.log(`  [firestore]   ${written} recipes patched`);
}

async function main(): Promise<void> {
  console.log("=== Ingredient measure patch (#251 follow-up) ===");
  if (isDryRun) console.log("DRY RUN — no writes will happen");
  console.log(`Recommender: ${RECOMMENDER_URL}`);

  const recipes = await fetchRecipes();
  console.log(`Fetched ${recipes.length} recipes from recommender.`);

  const changes = await computeChanges(recipes);

  if (changes.length > 0) {
    console.log("\nSample corrections:");
    for (const { recipe, corrected } of changes.slice(0, 8)) {
      console.log(`\n  ${recipe.id} — ${recipe.name}`);
      console.log(`    before: ${describe(recipe.ingredients)}`);
      console.log(`    after:  ${describe(corrected)}`);
    }
    if (changes.length > 8) console.log(`\n  … and ${changes.length - 8} more.`);
  }

  if (isDryRun || changes.length === 0) {
    console.log(isDryRun ? "\nDry run complete — no data written." : "\nNothing to patch.");
    return;
  }

  if (!skipRecommender) {
    console.log("\nPatching recommender…");
    await writeRecommender(changes);
  }
  if (!skipFirestore) {
    console.log("\nPatching Firestore…");
    await writeFirestore(changes);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
