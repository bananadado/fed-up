#!/usr/bin/env bun
/**
 * Fetch all recipe records from the recommender API and Firestore, identify
 * imported recipes that should be removed from the catalogue, and delete them
 * from both stores when explicitly applied.
 *
 * Targets:
 *   - recipes tagged vegetarian/vegan while containing meat, fish, seafood,
 *     gelatin or lard
 *   - standalone breads, pickles, dips, condiments and sauces
 *   - unhealthy fried snack/starter recipes such as fried dumplings, pakora,
 *     samosas, fritters and similar items
 *
 * Default mode is a dry run. It writes a report and performs no deletes unless
 * --apply is provided.
 *
 * Usage:
 *   bun scripts/cleanup-recipes.ts
 *   bun scripts/cleanup-recipes.ts --apply
 *   bun scripts/cleanup-recipes.ts --report tmp/recipe-cleanup-report.json
 *   bun scripts/cleanup-recipes.ts --keep-id tmdb-12345
 *   bun scripts/cleanup-recipes.ts --remove-id tmdb-52785
 *   bun scripts/cleanup-recipes.ts --remove-name "Challah" --only-manual
 *   bun scripts/cleanup-recipes.ts --include-non-tmdb
 *   bun scripts/cleanup-recipes.ts --include-user-recipes
 *   bun scripts/cleanup-recipes.ts --no-firestore
 *   bun scripts/cleanup-recipes.ts --no-recommender
 *
 * Env:
 *   RECOMMENDER_API_URL   default http://gru.end-pickerel.ts.net:8100
 *   RECOMMENDER_API_KEY   required for recommender reads/deletes
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64 | GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_PROJECT_ID   default drp03-50059
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import { deleteRecipe, listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";
import type { Ingredient } from "./ingest/types.ts";

type StoreName = "recommender" | "firestore";
type UnknownRecord = Record<string, unknown>;

type FirestoreRecipe = {
  id: string;
  data: UnknownRecord;
};

type CombinedRecipe = {
  id: string;
  stores: StoreName[];
  recommender?: RecipeOut;
  firestore?: UnknownRecord;
};

type Reason = {
  code: string;
  detail: string;
};

type Candidate = {
  id: string;
  name: string;
  stores: StoreName[];
  reasons: Reason[];
  tags: string[];
  ingredients: string[];
  source?: string;
};

type Report = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  recommenderUrl?: string;
  counts: {
    recommender: number;
    firestore: number;
    combined: number;
    outOfScope: number;
    candidates: number;
    keptByOverride: number;
    manualRemovals: number;
  };
  candidates: Candidate[];
  outOfScope: Array<{ id: string; name: string; reason: string; stores: StoreName[] }>;
  keptByOverride: Array<{ id: string; name: string; stores: StoreName[] }>;
  deleteResult?: DeleteResult;
};

type DeleteFailure = {
  id: string;
  name: string;
  store: StoreName;
  error: string;
};

type StoreDeleteResult = {
  deleted: number;
  missing?: number;
  failed: number;
};

type DeleteResult = {
  recommender?: StoreDeleteResult;
  firestore?: StoreDeleteResult;
  failures: DeleteFailure[];
};

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function optionValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]!);
  }
  return values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}

function canonicalRecipeName(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

const apply = flag("--apply");
const dryRunFlag = flag("--dry-run");
if (apply && dryRunFlag) {
  throw new Error("Use either --apply or --dry-run, not both.");
}

const skipFirestore = flag("--no-firestore");
const skipRecommender = flag("--no-recommender");
if (skipFirestore && skipRecommender) {
  throw new Error("Nothing to scan: --no-firestore and --no-recommender were both supplied.");
}

const includeNonTmdb = flag("--include-non-tmdb");
const includeUserRecipes = flag("--include-user-recipes");
const reportPath = option("--report") ?? "tmp/recipe-cleanup-report.json";
const baseUrl = skipRecommender ? undefined : recommenderUrl(option("--recommender-url"));
const keepIds = new Set(optionValues("--keep-id"));
const manualRemoveIds = new Set([...optionValues("--remove-id"), ...optionValues("--force-id")]);
const manualRemoveNames = new Set(optionValues("--remove-name").map(canonicalRecipeName));
const onlyManual = flag("--only-manual");
const isDryRun = !apply;

const NON_VEGETARIAN_PATTERNS: Array<[string, RegExp]> = [
  ["beef/steak", /\b(beef|steak|sirloin|ribeye|brisket|oxtail|veal)\b/i],
  ["chicken", /\b(chicken|chicken thighs?|chicken breasts?|hen)\b/i],
  ["pork", /\b(pork|bacon|ham|prosciutto|salami|chorizo|pepperoni|lard)\b/i],
  ["lamb/mutton", /\b(lamb|mutton)\b/i],
  ["goat", /\bgoat\b(?!\s*cheese)(?!['’]s\s+cheese)/i],
  ["turkey", /\bturkey\b/i],
  ["duck", /\bduck\b/i],
  ["fish/seafood", /\b(fish|salmon|tuna|cod|haddock|mackerel|sardines?|anchov(?:y|ies)|prawns?|shrimp|crab|lobster|mussels?|clams?|oysters?|scallops?|squid|seafood)\b/i],
  ["gelatin/lard", /\b(gelatin|gelatine|lard|suet)\b/i],
];

const VEGAN_ONLY_CONFLICTS: Array<[string, RegExp]> = [
  ["dairy", /\b(milk|butter|cream|cheese|yoghurt|yogurt|ghee|whey|lactose|halloumi|mozzarella|parmesan|cheddar|feta|ricotta)\b/i],
  ["egg", /\beggs?\b/i],
  ["honey", /\bhoney\b/i],
];

const BREAD_PATTERNS: Array<[string, RegExp]> = [
  ["bread", /\b(breads?|garlic bread|banana bread|soda bread|cornbread)\b/i],
  ["flatbread", /\b(flatbreads?|focaccia|baguettes?|brioche|naan|chapatis?|parathas?|pitas?)\b/i],
];

const CONDIMENT_PATTERNS: Array<[string, RegExp]> = [
  ["pickle", /\b(pickles?|pickled onions?|pickled cucumber)\b/i],
  ["chutney/relish", /\b(chutney|relish)\b/i],
  ["dip", /\b(hummus|houmous|guacamole|tzatziki|raita|baba ganoush|dips?)\b/i],
  ["condiment", /\b(jam|jelly|marmalade|dressing|marinade|pesto|tapenade|gravy|stock|mayonnaise|mayo|aioli|ketchup|mustard)\b/i],
  ["standalone sauce", /\b(sauce|salsa)\b/i],
];

const MEAL_TITLE_PATTERN =
  /\b(burgers?|pies?|curr(?:y|ies)|soups?|stews?|salads?|pastas?|noodles?|rice|risotto|stir[- ]?fr(?:y|ies)|grills?|roasts?|casseroles?|omelettes?|omelets?|pizzas?|tacos?|burritos?|sandwiches?|wraps?|kebabs?|skewers?|cutlets?|chops?|steaks?|fillets?|burgers?|beans?|potatoes?|lentils?|dhal|dal)\b/i;

const FRIED_SNACK_PATTERNS: Array<[string, RegExp]> = [
  ["dumpling", /\b(dumplings?|wontons?|potstickers?|gyoza)\b/i],
  ["fried starter", /\b(samosas?|pakoras?|bhajis?|fritters?|croquettes?|spring rolls?|arancini|falafel|hush puppies)\b/i],
];

const FRIED_TEXT_PATTERN = /\b(deep[- ]?fr(?:y|ied|ying)|fried|fry in oil|hot oil)\b/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asIngredientArray(value: unknown): Ingredient[] {
  return Array.isArray(value) ? value.filter((item): item is Ingredient => {
    return !!item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string";
  }) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function wordCount(value: string): number {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function recipeName(recipe: CombinedRecipe): string {
  return asString(recipe.recommender?.name) || asString(recipe.firestore?.["name"]) || recipe.id;
}

function recipeTags(recipe: CombinedRecipe): string[] {
  return unique([
    ...asStringArray(recipe.recommender?.dietary_tags),
    ...asStringArray(recipe.recommender?.suitability_tags),
    ...asStringArray(recipe.firestore?.["tags"]),
  ].map((tag) => normalizeText(tag)));
}

function recipeIngredients(recipe: CombinedRecipe): Ingredient[] {
  const recommenderIngredients = asIngredientArray(recipe.recommender?.ingredients);
  const firestoreIngredients = asIngredientArray(recipe.firestore?.["ingredients"]);
  return recommenderIngredients.length > 0 ? recommenderIngredients : firestoreIngredients;
}

function recipeInstructions(recipe: CombinedRecipe): string[] {
  return [
    ...asStringArray(recipe.recommender?.instructions),
    ...asStringArray(recipe.firestore?.["instructions"]),
  ];
}

function recipeTechniques(recipe: CombinedRecipe): string[] {
  return asStringArray(recipe.recommender?.techniques);
}

function recipeSource(recipe: CombinedRecipe): string | undefined {
  const source = asString(recipe.recommender?.source) || asString(recipe.firestore?.["source"]);
  return source || undefined;
}

function isUserOwnedRecipe(recipe: CombinedRecipe): boolean {
  return recipe.id.startsWith("custom-") || typeof recipe.firestore?.["ownerUid"] === "string";
}

function scopeReason(recipe: CombinedRecipe): string | null {
  if (!includeUserRecipes && isUserOwnedRecipe(recipe)) return "user-owned recipe";
  if (!includeNonTmdb && !/^tmdb-\d+$/.test(recipe.id)) return "non-TheMealDB recipe";
  return null;
}

function isManualRemoval(recipe: CombinedRecipe): boolean {
  return manualRemoveIds.has(recipe.id) || manualRemoveNames.has(canonicalRecipeName(recipeName(recipe)));
}

function matchingLabels(text: string, patterns: Array<[string, RegExp]>): string[] {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function looksStandaloneNonMeal(name: string, patterns: Array<[string, RegExp]>): string[] {
  const labels = matchingLabels(name, patterns);
  if (labels.length === 0) return [];

  const words = wordCount(name);
  const normalized = normalizeText(name);
  const hasMealConnector = /\b(with|over|in|served|stuffed|filled|topped)\b/.test(normalized);

  if (hasMealConnector) return [];
  return words <= 8 ? labels : [];
}

function looksStandaloneCondiment(name: string): string[] {
  const labels = matchingLabels(name, CONDIMENT_PATTERNS);
  if (labels.length === 0) return [];

  const normalized = normalizeText(name);
  if (MEAL_TITLE_PATTERN.test(normalized)) return [];
  if (/\b(with|over|served|stuffed|filled|topped)\b/.test(normalized)) return [];

  const words = wordCount(name);
  return words <= 4 ? labels : [];
}

function classifyRecipe(recipe: CombinedRecipe): Reason[] {
  const name = recipeName(recipe);
  const tags = recipeTags(recipe);
  const ingredients = recipeIngredients(recipe);
  const ingredientText = ingredients.map((ingredient) => ingredient.name).join(" | ");
  const instructionsText = recipeInstructions(recipe).join(" ");
  const techniqueText = recipeTechniques(recipe).join(" ");
  const nameAndIngredients = `${name} | ${ingredientText}`;
  const fullText = `${nameAndIngredients} | ${instructionsText} | ${techniqueText}`;
  const reasons: Reason[] = [];

  const taggedVegetarian = tags.includes("vegetarian") || tags.includes("vegan");
  if (taggedVegetarian) {
    const labels = matchingLabels(nameAndIngredients, NON_VEGETARIAN_PATTERNS);
    if (labels.length > 0) {
      reasons.push({
        code: "dietary-conflict",
        detail: `tagged vegetarian/vegan but contains ${labels.join(", ")}`,
      });
    }
  }

  if (tags.includes("vegan")) {
    const labels = matchingLabels(nameAndIngredients, VEGAN_ONLY_CONFLICTS);
    if (labels.length > 0) {
      reasons.push({
        code: "vegan-conflict",
        detail: `tagged vegan but contains ${labels.join(", ")}`,
      });
    }
  }

  const breadLabels = looksStandaloneNonMeal(name, BREAD_PATTERNS);
  if (breadLabels.length > 0) {
    reasons.push({
      code: "non-meal-bread",
      detail: `standalone bread/flatbread match: ${breadLabels.join(", ")}`,
    });
  }

  const condimentLabels = looksStandaloneCondiment(name);
  if (condimentLabels.length > 0) {
    reasons.push({
      code: "non-meal-condiment",
      detail: `standalone pickle/dip/condiment match: ${condimentLabels.join(", ")}`,
    });
  }

  const friedSnackLabels = matchingLabels(name, FRIED_SNACK_PATTERNS);
  if (friedSnackLabels.length > 0 && FRIED_TEXT_PATTERN.test(fullText)) {
    reasons.push({
      code: "fried-snack",
      detail: `fried snack/starter match: ${friedSnackLabels.join(", ")}`,
    });
  }

  if (isManualRemoval(recipe)) {
    reasons.push({
      code: "manual-remove",
      detail: "listed with --remove-id/--force-id/--remove-name",
    });
  }

  return reasons;
}

async function fetchFirestoreRecipes(): Promise<FirestoreRecipe[]> {
  initFirebase();
  const snapshot = await getFirestore().collection("recipes").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as UnknownRecord }));
}

function combineRecipes(recommender: RecipeOut[], firestore: FirestoreRecipe[]): CombinedRecipe[] {
  const byId = new Map<string, CombinedRecipe>();

  for (const recipe of recommender) {
    byId.set(recipe.id, { id: recipe.id, stores: ["recommender"], recommender: recipe });
  }

  for (const doc of firestore) {
    const existing = byId.get(doc.id);
    if (existing) {
      existing.firestore = doc.data;
      existing.stores = unique([...existing.stores, "firestore"]) as StoreName[];
    } else {
      byId.set(doc.id, { id: doc.id, stores: ["firestore"], firestore: doc.data });
    }
  }

  return [...byId.values()].sort((a, b) => recipeName(a).localeCompare(recipeName(b)));
}

async function writeReport(report: Report): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function deleteFromRecommender(
  candidates: Candidate[],
): Promise<{ succeeded: Candidate[]; result: StoreDeleteResult; failures: DeleteFailure[] }> {
  if (!baseUrl) return { succeeded: candidates, result: { deleted: 0, missing: 0, failed: 0 }, failures: [] };
  let deleted = 0;
  let missing = 0;
  let failed = 0;
  let processed = 0;
  const succeeded: Candidate[] = [];
  const failures: DeleteFailure[] = [];
  for (const candidate of candidates) {
    try {
      const status = await deleteRecipe(baseUrl, candidate.id);
      succeeded.push(candidate);
      if (status === "deleted") deleted++;
      else missing++;
    } catch (error) {
      failed++;
      failures.push({
        id: candidate.id,
        name: candidate.name,
        store: "recommender",
        error: error instanceof Error ? error.message : String(error),
      });
      console.warn(`\n  [recommender] ${candidate.id} failed: ${failures.at(-1)?.error}`);
    }
    processed++;
    process.stdout.write(`  [recommender] ${processed}/${candidates.length}\r`);
  }
  console.log(`  [recommender] ${deleted} deleted, ${missing} already missing, ${failed} failed`);
  return { succeeded, result: { deleted, missing, failed }, failures };
}

async function deleteFromFirestore(candidates: Candidate[]): Promise<{ result: StoreDeleteResult; failures: DeleteFailure[] }> {
  initFirebase();
  const db = getFirestore();
  const recipesRef = db.collection("recipes");
  const BATCH_SIZE = 400;
  let written = 0;
  let failed = 0;
  const failures: DeleteFailure[] = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const chunk = candidates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const candidate of chunk) {
      batch.delete(recipesRef.doc(candidate.id));
    }
    try {
      await batch.commit();
      written += chunk.length;
    } catch (error) {
      failed += chunk.length;
      const message = error instanceof Error ? error.message : String(error);
      for (const candidate of chunk) {
        failures.push({ id: candidate.id, name: candidate.name, store: "firestore", error: message });
      }
      console.warn(`\n  [firestore] batch failed for ${chunk.length} recipes: ${message}`);
    }
    process.stdout.write(`  [firestore]   ${written}/${candidates.length}\r`);
  }
  console.log(`  [firestore]   ${written} delete operations committed, ${failed} failed`);
  return { result: { deleted: written, failed }, failures };
}

function toCandidate(recipe: CombinedRecipe, reasons: Reason[]): Candidate {
  return {
    id: recipe.id,
    name: recipeName(recipe),
    stores: recipe.stores,
    reasons,
    tags: recipeTags(recipe),
    ingredients: recipeIngredients(recipe).map((ingredient) => ingredient.name),
    ...(recipeSource(recipe) ? { source: recipeSource(recipe) } : {}),
  };
}

function printCandidates(candidates: Candidate[]): void {
  if (candidates.length === 0) {
    console.log("\nNo removal candidates found.");
    return;
  }

  console.log("\nRemoval candidates:");
  for (const candidate of candidates.slice(0, 25)) {
    const reasonText = candidate.reasons.map((reason) => `${reason.code}: ${reason.detail}`).join("; ");
    console.log(`  ${candidate.id} - ${candidate.name}`);
    console.log(`    ${reasonText}`);
  }
  if (candidates.length > 25) {
    console.log(`  ... and ${candidates.length - 25} more. See ${reportPath}`);
  }
}

async function main(): Promise<void> {
  console.log("=== Recipe cleanup ===");
  if (isDryRun) console.log("DRY RUN - no deletes will happen. Use --apply to remove candidates.");
  if (!includeNonTmdb) console.log("Scope: TheMealDB imports only. Use --include-non-tmdb to scan seeded curated recipes too.");
  if (!includeUserRecipes) console.log("Scope: user-owned recipes are skipped. Use --include-user-recipes to include them.");
  if (onlyManual) console.log("Scope: manual removals only.");
  if (baseUrl) console.log(`Recommender: ${baseUrl}`);

  const [recommenderRecipes, firestoreRecipes] = await Promise.all([
    skipRecommender ? Promise.resolve([]) : listRecipes(baseUrl!),
    skipFirestore ? Promise.resolve([]) : fetchFirestoreRecipes(),
  ]);

  console.log(`Fetched ${recommenderRecipes.length} recommender recipes`);
  console.log(`Fetched ${firestoreRecipes.length} Firestore recipes`);

  const combined = combineRecipes(recommenderRecipes, firestoreRecipes);
  const candidates: Candidate[] = [];
  const outOfScope: Report["outOfScope"] = [];
  const keptByOverride: Report["keptByOverride"] = [];

  for (const recipe of combined) {
    if (keepIds.has(recipe.id)) {
      keptByOverride.push({ id: recipe.id, name: recipeName(recipe), stores: recipe.stores });
      continue;
    }

    const manual = isManualRemoval(recipe);
    const excluded = scopeReason(recipe);
    if (excluded && !manual) {
      outOfScope.push({ id: recipe.id, name: recipeName(recipe), reason: excluded, stores: recipe.stores });
      continue;
    }

    const reasons = classifyRecipe(recipe);
    if (onlyManual && !manual) continue;
    if (reasons.length > 0) candidates.push(toCandidate(recipe, reasons));
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? "dry-run" : "apply",
    ...(baseUrl ? { recommenderUrl: baseUrl } : {}),
    counts: {
      recommender: recommenderRecipes.length,
      firestore: firestoreRecipes.length,
      combined: combined.length,
      outOfScope: outOfScope.length,
      candidates: candidates.length,
      keptByOverride: keptByOverride.length,
      manualRemovals: manualRemoveIds.size + manualRemoveNames.size,
    },
    candidates,
    outOfScope,
    keptByOverride,
  };

  await writeReport(report);
  printCandidates(candidates);
  console.log(`\nReport written to ${reportPath}`);

  if (isDryRun || candidates.length === 0) {
    console.log(isDryRun ? "\nDry run complete - no data deleted." : "\nNothing to delete.");
    return;
  }

  const deleteResult: DeleteResult = { failures: [] };
  let firestoreTargets = candidates;

  if (!skipRecommender) {
    console.log("\nDeleting from recommender API...");
    const recommenderDelete = await deleteFromRecommender(candidates);
    deleteResult.recommender = recommenderDelete.result;
    deleteResult.failures.push(...recommenderDelete.failures);
    firestoreTargets = recommenderDelete.succeeded;
    if (!skipFirestore && firestoreTargets.length < candidates.length) {
      console.log(
        `\nSkipping Firestore delete for ${candidates.length - firestoreTargets.length} recipe(s) ` +
          "that failed in the recommender API.",
      );
    }
  }
  if (!skipFirestore) {
    console.log("\nDeleting from Firestore...");
    const firestoreDelete = await deleteFromFirestore(firestoreTargets);
    deleteResult.firestore = firestoreDelete.result;
    deleteResult.failures.push(...firestoreDelete.failures);
  }

  report.deleteResult = deleteResult;
  await writeReport(report);

  if (deleteResult.failures.length > 0) {
    console.error(`\nCompleted with ${deleteResult.failures.length} deletion failure(s). See ${reportPath}.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
