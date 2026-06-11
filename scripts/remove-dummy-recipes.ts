import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import { deleteRecipe, listRecipes, recommenderUrl, type RecipeOut } from "./ingest/recommender.ts";

type RecipeLike = {
  id?: unknown;
  name?: unknown;
  source?: unknown;
  note?: unknown;
};

type RemovalCandidate = {
  id: string;
  name: string;
  source: string;
  reason: string;
  stores: Set<"firestore" | "recommender">;
};

type SkippedCandidate = {
  id: string;
  name: string;
  source: string;
  reason: string;
  store: "firestore" | "recommender";
};

const blockedRecipePatterns = [
  { reason: "dummy marker", pattern: /\bdummy\b/i },
  { reason: "placeholder marker", pattern: /\bplaceholder\b/i },
  { reason: "sample recipe marker", pattern: /\bsample recipe\b/i },
  { reason: "test recipe marker", pattern: /\btest recipe\b/i },
  { reason: "microwave bean burrito placeholder", pattern: /\bmicrowav(?:e|able)\s+bean\s+burrito\b/i },
  { reason: "bean burrito placeholder", pattern: /\bbean\s+burrito\b/i },
];

const nonProtectiveSourcePatterns = [
  /^\s*my recipes\s*$/i,
  /^\s*custom\s*$/i,
  /^\s*user(?: created)?\s*$/i,
  /\bfed up prototype\b/i,
  /\bdeadline food prototype\b/i,
  /\bprototype\b/i,
  /\bdummy\b/i,
  /\bplaceholder\b/i,
  /\bsample\b/i,
  /\btest\b/i,
  /\bseed\b/i,
  /\binternal\b/i,
  /^\s*unknown\s*$/i,
];

function textFor(recipe: RecipeLike): string {
  return [recipe.id, recipe.name, recipe.note]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function blockedReason(recipe: RecipeLike): string | null {
  const text = textFor(recipe);
  return blockedRecipePatterns.find(({ pattern }) => pattern.test(text))?.reason ?? null;
}

function hasProtectedSource(source: string): boolean {
  return source.trim().length > 0 && !nonProtectiveSourcePatterns.some((pattern) => pattern.test(source));
}

function upsertCandidate(
  candidates: Map<string, RemovalCandidate>,
  skipped: SkippedCandidate[],
  recipe: RecipeLike,
  store: "firestore" | "recommender",
): void {
  if (typeof recipe.id !== "string" || !recipe.id.trim()) return;
  const reason = blockedReason(recipe);
  if (!reason) return;
  const source = typeof recipe.source === "string" ? recipe.source.trim() : "";
  const name = typeof recipe.name === "string" && recipe.name.trim() ? recipe.name : recipe.id;
  if (hasProtectedSource(source)) {
    skipped.push({ id: recipe.id, name, source, reason, store });
    return;
  }

  const existing = candidates.get(recipe.id);
  if (existing) {
    existing.stores.add(store);
    return;
  }

  candidates.set(recipe.id, {
    id: recipe.id,
    name,
    source,
    reason,
    stores: new Set([store]),
  });
}

async function collectFirestoreCandidates(
  candidates: Map<string, RemovalCandidate>,
  skipped: SkippedCandidate[],
): Promise<void> {
  initFirebase();
  const snapshot = await getFirestore().collection("recipes").get();
  snapshot.forEach((doc) => {
    upsertCandidate(candidates, skipped, { id: doc.id, ...doc.data() }, "firestore");
  });
}

async function collectRecommenderCandidates(
  candidates: Map<string, RemovalCandidate>,
  skipped: SkippedCandidate[],
  baseUrl: string,
): Promise<void> {
  const recipes = await listRecipes(baseUrl);
  recipes.forEach((recipe: RecipeOut) => {
    upsertCandidate(candidates, skipped, {
      id: recipe.id,
      name: recipe.name,
      source: recipe.source,
      note: recipe.note,
    }, "recommender");
  });
}

function printUsage(): void {
  console.log([
    "Usage: bun scripts/remove-dummy-recipes.ts [--confirm] [--firestore-only|--recommender-only] [--recommender-url URL]",
    "",
    "Default mode is a dry run. Pass --confirm to delete matching recipes.",
    "Recipes with a real external source are skipped and reported, not deleted.",
  ].join("\n"));
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.includes("--help")) {
    printUsage();
    return;
  }

  const confirm = args.includes("--confirm");
  const firestoreOnly = args.includes("--firestore-only");
  const recommenderOnly = args.includes("--recommender-only");
  if (firestoreOnly && recommenderOnly) {
    throw new Error("Choose only one of --firestore-only or --recommender-only.");
  }

  const urlIndex = args.indexOf("--recommender-url");
  const baseUrl = recommenderUrl(urlIndex >= 0 ? args[urlIndex + 1] : undefined);
  const candidates = new Map<string, RemovalCandidate>();
  const skipped: SkippedCandidate[] = [];

  if (!recommenderOnly) {
    await collectFirestoreCandidates(candidates, skipped);
  }
  if (!firestoreOnly) {
    await collectRecommenderCandidates(candidates, skipped, baseUrl);
  }

  const sorted = [...candidates.values()].sort((a, b) => a.id.localeCompare(b.id));
  const skippedSorted = skipped.sort((a, b) => a.id.localeCompare(b.id));
  if (sorted.length === 0) {
    console.log("No unsourced dummy, placeholder, test, or bean burrito recipes found.");
  } else {
    console.log(`${confirm ? "Deleting" : "Dry run: found"} ${sorted.length} blocked unsourced recipe${sorted.length === 1 ? "" : "s"}:`);
    sorted.forEach((candidate) => {
      console.log(`- ${candidate.id} (${candidate.name}) [${[...candidate.stores].join(", ")}] ${candidate.reason}`);
    });
  }

  if (skippedSorted.length > 0) {
    console.log(`\nSkipped ${skippedSorted.length} matched real-sourced recipe${skippedSorted.length === 1 ? "" : "s"}:`);
    skippedSorted.forEach((candidate) => {
      console.log(`- ${candidate.id} (${candidate.name}) [${candidate.store}] ${candidate.reason}; source=${candidate.source}`);
    });
  }

  if (sorted.length === 0) return;

  if (!confirm) {
    console.log("\nNo data was deleted. Re-run with --confirm to remove these recipes.");
    return;
  }

  const db = !recommenderOnly ? getFirestore() : null;
  for (const candidate of sorted) {
    if (db && candidate.stores.has("firestore")) {
      await db.collection("recipes").doc(candidate.id).delete();
    }
    if (!firestoreOnly && candidate.stores.has("recommender")) {
      await deleteRecipe(baseUrl, candidate.id);
    }
  }

  console.log(`Removed ${sorted.length} blocked recipe${sorted.length === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
