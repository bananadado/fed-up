/**
 * OpenFoodFacts ingredient lookup + nutrition estimation.
 *
 * This is a script-side port of the logic in functions/src/index.ts so the two
 * stay in lock-step. The Firestore cache documents written here have the exact
 * shape the `deadlineFoodNutrition` function reads, so pre-populating the cache
 * from a script means live requests are served straight from Firestore.
 *
 * Cache collection: openFoodFactsNutritionCache/{base64url(normalizeIngredientKey(name))}
 *   { cacheKey, product: <compacted | null>, expiresAt: Timestamp, updatedAt }
 *
 * OpenFoodFacts search API is rate limited (~10 req/min), so callers should
 * keep a courtesy delay between `findProductForIngredient` calls.
 */

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import type { Ingredient, Nutrition } from "./types.ts";

// ── Config ───────────────────────────────────────────────────────────────────

const OFF_BASE_URL = (
  process.env["OPENFOODFACTS_BASE_URL"] ?? "https://world.openfoodfacts.org"
).replace(/\/$/, "");

const OFF_USER_AGENT =
  process.env["OPENFOODFACTS_USER_AGENT"] ??
  "DeadlineFoodPrototype/0.1 (recipe nutrition ingestion)";

const OFF_TIMEOUT_MS = 6000;

const CACHE_COLLECTION = "openFoodFactsNutritionCache";

// ── Nutrition provider ───────────────────────────────────────────────────────

/** Which upstream database a cached product came from. */
export type NutritionProvider = "USDA" | "OpenFoodFacts";

// ── OpenFoodFacts wire types ─────────────────────────────────────────────────

/**
 * Per-100g product shape. Originally the OpenFoodFacts wire shape, now the
 * common shape every nutrition source normalises into (USDA results are mapped
 * onto the same `nutriments` keys so the live function reads them unchanged).
 * `provider` records which database it came from; the live function ignores it.
 */
export type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  provider?: NutritionProvider;
  nutriments?: {
    "energy-kcal_100g"?: number;
    energy_100g?: number;
    energy_unit?: string;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
};

type OpenFoodFactsSearchResponse = {
  products?: OpenFoodFactsProduct[];
};

/** Per-ingredient contribution to a recipe's total nutrition. */
export type IngredientNutritionEstimate = {
  ingredient: Ingredient;
  productName: string;
  provider: NutritionProvider;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Nutrition enriched with provenance — written to Firestore recipes/{id}. */
export type NutritionWithSource = Nutrition & {
  source: {
    provider: NutritionProvider | "USDA + OpenFoodFacts";
    label: string;
    fetchedAt: string;
    matchedIngredients: { ingredient: string; productName: string; grams: number }[];
    missingIngredients: string[];
  };
};

// ── Ingredient name → category term mapping (ported from the function) ────────

const servingGrams: Record<string, number> = {
  banana: 120,
  bread: 80,
  egg: 50,
  eggs: 50,
  flatbread: 70,
  "jacket potato": 250,
  "microwave rice": 250,
  "rice portion": 180,
  "tortilla wrap": 60,
  wrap: 60,
};

const cookingAdjectives = new Set([
  "baby", "canned", "chopped", "cooked", "diced", "dried", "frozen", "grated",
  "large", "medium", "minced", "organic", "raw", "sliced", "small", "tinned", "whole",
]);

const irregularCategoryTerms: Record<string, string[]> = {
  berry: ["berries"],
  berries: ["berries"],
  courgette: ["courgettes", "zucchini"],
  egg: ["eggs"],
  pepper: ["peppers"],
  potato: ["potatoes"],
  tomato: ["tomatoes"],
};

export function normalizeIngredientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheDocId(cacheKey: string): string {
  return Buffer.from(cacheKey).toString("base64url");
}

function toCategoryTag(term: string): string {
  return normalizeIngredientKey(term)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map(toCategoryTag).filter(Boolean))];
}

function categoryTerms(name: string): string[] {
  const key = normalizeIngredientKey(name);
  const terms = [key, ...(irregularCategoryTerms[key] ?? [])];
  const words = key.split(" ");

  if (words.length > 1 && words[0] && cookingAdjectives.has(words[0])) {
    const stripped = words.slice(1).join(" ");
    terms.push(stripped, ...(irregularCategoryTerms[stripped] ?? []));
  }

  if (words.length > 1 && words[0] && words[0].length > 2) {
    terms.push(words[0], ...(irregularCategoryTerms[words[0]] ?? []));
  }

  return uniqueTerms(terms);
}

// ── Nutrition estimation (ported from the function) ──────────────────────────

export function gramsForIngredient(ingredient: Ingredient): number {
  switch (ingredient.unit) {
  case "g":
    return ingredient.quantity;
  case "kg":
    return ingredient.quantity * 1000;
  case "ml":
    return ingredient.quantity;
  case "l":
    return ingredient.quantity * 1000;
  case "tsp":
    return ingredient.quantity * 5;
  case "tbsp":
    return ingredient.quantity * 15;
  case "cup":
    return ingredient.quantity * 240;
  case "can":
    return ingredient.quantity * 400;
  default:
    return ingredient.quantity * (servingGrams[ingredient.name.toLowerCase()] ?? 100);
  }
}

export function estimateIngredientNutrition(
  ingredient: Ingredient,
  product: OpenFoodFactsProduct,
): IngredientNutritionEstimate | null {
  const nutriments = product.nutriments;
  const grams = gramsForIngredient(ingredient);
  const caloriesPer100g =
    typeof nutriments?.["energy-kcal_100g"] === "number" ?
      nutriments["energy-kcal_100g"] :
      nutriments?.energy_unit === "kJ" && typeof nutriments.energy_100g === "number" ?
        nutriments.energy_100g / 4.184 :
        null;

  if (
    caloriesPer100g === null ||
    typeof nutriments?.proteins_100g !== "number" ||
    typeof nutriments.carbohydrates_100g !== "number" ||
    typeof nutriments.fat_100g !== "number"
  ) {
    return null;
  }

  const multiplier = grams / 100;

  return {
    ingredient,
    productName: product.product_name?.trim() || ingredient.name,
    provider: product.provider ?? "OpenFoodFacts",
    grams,
    calories: caloriesPer100g * multiplier,
    protein: nutriments.proteins_100g * multiplier,
    carbs: nutriments.carbohydrates_100g * multiplier,
    fat: nutriments.fat_100g * multiplier,
  };
}

function roundMacro(value: number): number {
  return Math.max(0, Math.round(value));
}

export function totalNutritionFromEstimates(
  estimates: IngredientNutritionEstimate[],
  missingIngredients: string[],
): NutritionWithSource {
  const usedUsda = estimates.some((e) => e.provider === "USDA");
  const usedOff = estimates.some((e) => e.provider === "OpenFoodFacts");
  const provider =
    usedUsda && usedOff ? "USDA + OpenFoodFacts" : usedUsda ? "USDA" : "OpenFoodFacts";

  return {
    calories: roundMacro(estimates.reduce((sum, e) => sum + e.calories, 0)),
    protein: roundMacro(estimates.reduce((sum, e) => sum + e.protein, 0)),
    carbs: roundMacro(estimates.reduce((sum, e) => sum + e.carbs, 0)),
    fat: roundMacro(estimates.reduce((sum, e) => sum + e.fat, 0)),
    source: {
      provider,
      label: `${provider} estimate`,
      fetchedAt: new Date().toISOString(),
      matchedIngredients: estimates.map((e) => ({
        ingredient: e.ingredient.name,
        productName: e.productName,
        grams: roundMacro(e.grams),
      })),
      missingIngredients,
    },
  };
}

function compactProduct(product: OpenFoodFactsProduct): OpenFoodFactsProduct {
  const n = product.nutriments;
  return {
    ...(product.code ? { code: product.code } : {}),
    ...(product.product_name ? { product_name: product.product_name } : {}),
    ...(product.provider ? { provider: product.provider } : {}),
    nutriments: {
      ...(typeof n?.["energy-kcal_100g"] === "number" ? { "energy-kcal_100g": n["energy-kcal_100g"] } : {}),
      ...(typeof n?.energy_100g === "number" ? { energy_100g: n.energy_100g } : {}),
      ...(n?.energy_unit ? { energy_unit: n.energy_unit } : {}),
      ...(typeof n?.proteins_100g === "number" ? { proteins_100g: n.proteins_100g } : {}),
      ...(typeof n?.carbohydrates_100g === "number" ? { carbohydrates_100g: n.carbohydrates_100g } : {}),
      ...(typeof n?.fat_100g === "number" ? { fat_100g: n.fat_100g } : {}),
    },
  };
}

// ── OpenFoodFacts search ─────────────────────────────────────────────────────

async function searchProducts(categoryTag: string): Promise<OpenFoodFactsProduct[]> {
  const url = new URL("/api/v2/search", OFF_BASE_URL);
  url.searchParams.set("categories_tags_en", categoryTag);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "5");
  url.searchParams.set("sort_by", "popularity_key");
  url.searchParams.set("fields", "code,product_name,nutriments");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": OFF_USER_AGENT },
    signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
  }).catch(() => null);

  if (!response?.ok) return [];

  const payload = (await response.json().catch(() => null)) as OpenFoodFactsSearchResponse | null;
  return payload?.products ?? [];
}

/**
 * Look up the best OpenFoodFacts product for an ingredient name. Returns the
 * compacted product (per-100g nutriments only) or null when nothing usable is
 * found. `onSearch` fires once per OFF HTTP request so callers can rate-limit.
 */
export async function findProductForIngredient(
  name: string,
  onSearch?: (categoryTag: string) => Promise<void> | void,
): Promise<OpenFoodFactsProduct | null> {
  // Per-100g validity only depends on the product, so use a 100g probe.
  const probe: Ingredient = { name, quantity: 100, unit: "g" };

  for (const tag of categoryTerms(name)) {
    await onSearch?.(tag);
    const products = await searchProducts(tag);
    const match = products.find((p) => estimateIngredientNutrition(probe, p) !== null);
    if (match) return compactProduct({ ...match, provider: "OpenFoodFacts" });
  }

  return null;
}

// ── Firestore cache I/O (same shape as the function) ─────────────────────────

export function cacheKeyForName(name: string): string {
  return normalizeIngredientKey(name);
}

/** Read a cached product. Returns `undefined` when no cache document exists. */
export async function readCachedProduct(
  db: Firestore,
  cacheKey: string,
): Promise<OpenFoodFactsProduct | null | undefined> {
  const snapshot = await db.collection(CACHE_COLLECTION).doc(cacheDocId(cacheKey)).get();
  if (!snapshot.exists) return undefined;
  const value = snapshot.data()?.product;
  if (value === null) return null;
  return value as OpenFoodFactsProduct;
}

/**
 * Write a product (or a `null` miss marker) into the cache. `ttlMs` controls how
 * long the live function will treat the entry as fresh before re-fetching.
 */
export async function writeCachedProduct(
  db: Firestore,
  cacheKey: string,
  product: OpenFoodFactsProduct | null,
  ttlMs: number,
): Promise<void> {
  await db.collection(CACHE_COLLECTION).doc(cacheDocId(cacheKey)).set(
    {
      cacheKey,
      product,
      expiresAt: Timestamp.fromMillis(Date.now() + ttlMs),
      lockedUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
