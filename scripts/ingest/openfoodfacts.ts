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

import { gramsForIngredient as sharedGramsForIngredient } from "../../src/domain/ingredientMeasurements.ts";
import type { Ingredient, Nutrition } from "./types.ts";

// ── Config ───────────────────────────────────────────────────────────────────

const OFF_BASE_URL = (
  process.env["OPENFOODFACTS_BASE_URL"] ?? "https://world.openfoodfacts.org"
).replace(/\/$/, "");

const OFF_USER_AGENT =
  process.env["OPENFOODFACTS_USER_AGENT"] ??
  "DeadlineFoodApp/0.1 (recipe nutrition ingestion)";

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

const zeroMacroNutriments: NonNullable<OpenFoodFactsProduct["nutriments"]> = {
  "energy-kcal_100g": 0,
  proteins_100g: 0,
  carbohydrates_100g: 0,
  fat_100g: 0,
};

function usdaNutritionProduct(
  code: string,
  productName: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
): OpenFoodFactsProduct {
  return {
    provider: "USDA",
    code,
    product_name: productName,
    nutriments: {
      "energy-kcal_100g": calories,
      proteins_100g: protein,
      carbohydrates_100g: carbs,
      fat_100g: fat,
    },
  };
}

const curatedNutritionProducts: Record<string, OpenFoodFactsProduct> = {
  salt: {
    provider: "USDA",
    code: "curated-salt",
    product_name: "Salt",
    nutriments: zeroMacroNutriments,
  },
  "sea salt": {
    provider: "USDA",
    code: "curated-salt",
    product_name: "Salt",
    nutriments: zeroMacroNutriments,
  },
  "table salt": {
    provider: "USDA",
    code: "curated-salt",
    product_name: "Salt",
    nutriments: zeroMacroNutriments,
  },
  "vegetable stock": {
    provider: "USDA",
    code: "curated-vegetable-stock",
    product_name: "Vegetable stock, prepared",
    nutriments: {
      "energy-kcal_100g": 5,
      proteins_100g: 0.1,
      carbohydrates_100g: 1,
      fat_100g: 0,
    },
  },
  "vegetable broth": {
    provider: "USDA",
    code: "curated-vegetable-stock",
    product_name: "Vegetable stock, prepared",
    nutriments: {
      "energy-kcal_100g": 5,
      proteins_100g: 0.1,
      carbohydrates_100g: 1,
      fat_100g: 0,
    },
  },
  chickpeas: {
    provider: "USDA",
    code: "curated-chickpeas-cooked",
    product_name: "Chickpeas, cooked, boiled, drained",
    nutriments: {
      "energy-kcal_100g": 164,
      proteins_100g: 8.86,
      carbohydrates_100g: 27.42,
      fat_100g: 2.59,
    },
  },
  "garbanzo beans": {
    provider: "USDA",
    code: "curated-chickpeas-cooked",
    product_name: "Chickpeas, cooked, boiled, drained",
    nutriments: {
      "energy-kcal_100g": 164,
      proteins_100g: 8.86,
      carbohydrates_100g: 27.42,
      fat_100g: 2.59,
    },
  },
  "dried chickpeas": {
    provider: "USDA",
    code: "curated-chickpeas-dry",
    product_name: "Chickpeas, dry",
    nutriments: {
      "energy-kcal_100g": 378,
      proteins_100g: 20.47,
      carbohydrates_100g: 62.95,
      fat_100g: 6.04,
    },
  },
  "harissa spice": {
    provider: "USDA",
    code: "curated-harissa-spice",
    product_name: "Harissa spice blend",
    nutriments: {
      "energy-kcal_100g": 282,
      proteins_100g: 13.46,
      carbohydrates_100g: 49.7,
      fat_100g: 14.28,
    },
  },
  "garlic powder": {
    provider: "USDA",
    code: "curated-garlic-powder",
    product_name: "Spices, garlic powder",
    nutriments: {
      "energy-kcal_100g": 331,
      proteins_100g: 16.55,
      carbohydrates_100g: 72.73,
      fat_100g: 0.73,
    },
  },
  "garlic granules": {
    provider: "USDA",
    code: "curated-garlic-powder",
    product_name: "Spices, garlic powder",
    nutriments: {
      "energy-kcal_100g": 331,
      proteins_100g: 16.55,
      carbohydrates_100g: 72.73,
      fat_100g: 0.73,
    },
  },
  water: usdaNutritionProduct("curated-water", "Water", 0, 0, 0, 0),
  "boiling water": usdaNutritionProduct("curated-water", "Water", 0, 0, 0, 0),
  "cold water": usdaNutritionProduct("curated-water", "Water", 0, 0, 0, 0),
  "warm water": usdaNutritionProduct("curated-water", "Water", 0, 0, 0, 0),
  "soda water": usdaNutritionProduct("curated-water", "Carbonated water", 0, 0, 0, 0),
  "rose water": usdaNutritionProduct("curated-water", "Rose water", 0, 0, 0, 0),
  potatoes: usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "new potatoes": usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "baby new potatoes": usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "small potatoes": usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "charlotte potatoes": usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "floury potatoes": usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "jersey royal potatoes": usdaNutritionProduct("curated-potato-raw", "Potatoes, raw", 77, 2.05, 17.49, 0.09),
  "potato starch": usdaNutritionProduct("curated-potato-starch", "Potato starch", 357, 0.1, 83.3, 0.1),
  aubergine: usdaNutritionProduct("curated-eggplant-raw", "Eggplant, raw", 25, 0.98, 5.88, 0.18),
  "baby aubergine": usdaNutritionProduct("curated-eggplant-raw", "Eggplant, raw", 25, 0.98, 5.88, 0.18),
  "egg plants": usdaNutritionProduct("curated-eggplant-raw", "Eggplant, raw", 25, 0.98, 5.88, 0.18),
  courgette: usdaNutritionProduct("curated-zucchini-raw", "Zucchini, raw", 17, 1.21, 3.11, 0.32),
  courgettes: usdaNutritionProduct("curated-zucchini-raw", "Zucchini, raw", 17, 1.21, 3.11, 0.32),
  "cherry tomatoes": usdaNutritionProduct("curated-tomatoes-raw", "Tomatoes, raw", 18, 0.88, 3.89, 0.2),
  "chopped tomatoes": usdaNutritionProduct("curated-tomatoes-canned", "Tomatoes, canned", 20, 0.95, 4.0, 0.12),
  "canned tomatoes": usdaNutritionProduct("curated-tomatoes-canned", "Tomatoes, canned", 20, 0.95, 4.0, 0.12),
  "diced tomatoes": usdaNutritionProduct("curated-tomatoes-canned", "Tomatoes, canned", 20, 0.95, 4.0, 0.12),
  "tinned tomatos": usdaNutritionProduct("curated-tomatoes-canned", "Tomatoes, canned", 20, 0.95, 4.0, 0.12),
  "plum tomatoes": usdaNutritionProduct("curated-tomatoes-canned", "Tomatoes, canned", 20, 0.95, 4.0, 0.12),
  chilli: usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  chili: usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  chillies: usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  chilies: usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  "red chilli": usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  "green chilli": usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  "birds-eye chillies": usdaNutritionProduct("curated-hot-pepper-raw", "Peppers, hot, raw", 40, 1.87, 8.81, 0.44),
  "dried chillies": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "dried red chillies": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "chilli flakes": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "red chilli flakes": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "chilli powder": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "chili powder": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "red chilli powder": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "hot chilli powder": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  "pul biber": usdaNutritionProduct("curated-cayenne-pepper", "Spices, pepper, red or cayenne", 318, 12, 56.6, 17.3),
  paprika: usdaNutritionProduct("curated-paprika", "Spices, paprika", 282, 14.1, 54, 12.9),
  "smoked paprika": usdaNutritionProduct("curated-paprika", "Spices, paprika", 282, 14.1, 54, 12.9),
  "hot smoked paprika": usdaNutritionProduct("curated-paprika", "Spices, paprika", 282, 14.1, 54, 12.9),
  "sweet smoked paprika": usdaNutritionProduct("curated-paprika", "Spices, paprika", 282, 14.1, 54, 12.9),
  "smoky paprika": usdaNutritionProduct("curated-paprika", "Spices, paprika", 282, 14.1, 54, 12.9),
  "curry powder": usdaNutritionProduct("curated-curry-powder", "Spices, curry powder", 325, 14.29, 55.83, 14.01),
  "bay leaf": usdaNutritionProduct("curated-bay-leaf", "Spices, bay leaf", 313, 7.61, 74.97, 8.36),
  "bay leaves": usdaNutritionProduct("curated-bay-leaf", "Spices, bay leaf", 313, 7.61, 74.97, 8.36),
  "basil leaves": usdaNutritionProduct("curated-basil-raw", "Basil, fresh", 23, 3.15, 2.65, 0.64),
  "fresh basil": usdaNutritionProduct("curated-basil-raw", "Basil, fresh", 23, 3.15, 2.65, 0.64),
  "baby lettuce leaves": usdaNutritionProduct("curated-lettuce-raw", "Lettuce, raw", 15, 1.36, 2.87, 0.15),
  "cabbage leaves": usdaNutritionProduct("curated-cabbage-raw", "Cabbage, raw", 25, 1.28, 5.8, 0.1),
  "vine leaves": usdaNutritionProduct("curated-grape-leaves", "Grape leaves, raw", 93, 5.6, 17.3, 2.12),
  "wild garlic leaves": usdaNutritionProduct("curated-garlic-raw", "Garlic, raw", 149, 6.36, 33.06, 0.5),
  "lime leaves": usdaNutritionProduct("curated-bay-leaf", "Citrus leaves", 313, 7.61, 74.97, 8.36),
  "makrut lime leaves": usdaNutritionProduct("curated-bay-leaf", "Citrus leaves", 313, 7.61, 74.97, 8.36),
  "pandan leaves": usdaNutritionProduct("curated-water", "Pandan leaves", 0, 0, 0, 0),
  "garlic clove": usdaNutritionProduct("curated-garlic-raw", "Garlic, raw", 149, 6.36, 33.06, 0.5),
  "garlic cloves": usdaNutritionProduct("curated-garlic-raw", "Garlic, raw", 149, 6.36, 33.06, 0.5),
  "peppercorns": usdaNutritionProduct("curated-black-pepper", "Spices, pepper, black", 251, 10.4, 64, 3.26),
  "whole black peppercorns": usdaNutritionProduct("curated-black-pepper", "Spices, pepper, black", 251, 10.4, 64, 3.26),
  "caraway seed": usdaNutritionProduct("curated-caraway-seed", "Spices, caraway seed", 333, 19.77, 49.9, 14.59),
  "ground ginger": usdaNutritionProduct("curated-ground-ginger", "Spices, ginger, ground", 335, 8.98, 71.62, 4.24),
  "ground cardomom": usdaNutritionProduct("curated-cardamom", "Spices, cardamom", 311, 10.76, 68.47, 6.7),
  "ground annatto": usdaNutritionProduct("curated-annatto", "Spices, annatto seed", 345, 15.8, 52.3, 14.9),
  "ground oats": usdaNutritionProduct("curated-oats", "Oats", 379, 13.15, 67.7, 6.52),
  "black treacle": usdaNutritionProduct("curated-molasses", "Molasses", 290, 0, 74.73, 0.1),
  "apple cider vinegar": usdaNutritionProduct("curated-cider-vinegar", "Vinegar, cider", 21, 0, 0.93, 0),
  "malt vinegar": usdaNutritionProduct("curated-vinegar", "Vinegar", 18, 0, 0.04, 0),
  "rice vinegar": usdaNutritionProduct("curated-rice-vinegar", "Rice vinegar", 18, 0, 0.04, 0),
  "oat milk": usdaNutritionProduct("curated-oat-milk", "Oat milk", 48, 0.8, 6.7, 1.5),
  "full fat yogurt": usdaNutritionProduct("curated-whole-yogurt", "Yogurt, plain, whole milk", 61, 3.47, 4.66, 3.25),
  "full fat yoghurt": usdaNutritionProduct("curated-whole-yogurt", "Yogurt, plain, whole milk", 61, 3.47, 4.66, 3.25),
  "full fat sour cream": usdaNutritionProduct("curated-sour-cream", "Sour cream", 193, 2.07, 4.63, 19.35),
  "sour cream": usdaNutritionProduct("curated-sour-cream", "Sour cream", 193, 2.07, 4.63, 19.35),
  "goats cheese": usdaNutritionProduct("curated-goat-cheese", "Cheese, goat", 364, 21.58, 0.12, 29.84),
  "mozzarella balls": usdaNutritionProduct("curated-mozzarella", "Mozzarella", 280, 27.5, 3.1, 17.1),
  "melted butter": usdaNutritionProduct("curated-butter", "Butter", 717, 0.85, 0.06, 81.11),
  "self-raising flour": usdaNutritionProduct("curated-wheat-flour", "Wheat flour", 364, 10.33, 76.31, 0.98),
  "chestnut mushroom": usdaNutritionProduct("curated-mushrooms", "Mushrooms, raw", 22, 3.09, 3.26, 0.34),
  "petit pois": usdaNutritionProduct("curated-green-peas", "Peas, green, raw", 81, 5.42, 14.45, 0.4),
  "raw tiger prawns": usdaNutritionProduct("curated-shrimp", "Shrimp, raw", 85, 20.1, 0, 0.5),
  "turkey mince": usdaNutritionProduct("curated-ground-turkey", "Turkey, ground, raw", 148, 19.66, 0, 7.66),
  swede: usdaNutritionProduct("curated-rutabaga", "Rutabaga, raw", 37, 1.08, 8.62, 0.16),
  sardines: usdaNutritionProduct("curated-sardines", "Sardines", 208, 24.62, 0, 11.45),
  fries: usdaNutritionProduct("curated-french-fries", "Potatoes, french fried", 312, 3.43, 41.44, 14.73),
  "fillet of steak": usdaNutritionProduct("curated-beef-steak", "Beef steak, raw", 170, 20.0, 0, 10.0),
  "water chestnut": usdaNutritionProduct("curated-water-chestnut", "Water chestnuts, raw", 97, 1.4, 23.94, 0.1),
  "yellow masarepa": usdaNutritionProduct("curated-corn-flour", "Precooked corn flour", 360, 7.0, 79.0, 1.5),
};

export function curatedNutritionProductForIngredient(name: string): OpenFoodFactsProduct | null {
  return curatedNutritionProducts[normalizeIngredientKey(name)] ?? null;
}

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
  return sharedGramsForIngredient(ingredient);
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
    caloriesPer100g < 0 ||
    caloriesPer100g > 950 ||
    typeof nutriments?.proteins_100g !== "number" ||
    typeof nutriments.carbohydrates_100g !== "number" ||
    typeof nutriments.fat_100g !== "number" ||
    nutriments.proteins_100g < -1 ||
    nutriments.proteins_100g > 100 ||
    nutriments.carbohydrates_100g < -1 ||
    nutriments.carbohydrates_100g > 100 ||
    nutriments.fat_100g < -1 ||
    nutriments.fat_100g > 100
  ) {
    return null;
  }

  const multiplier = grams / 100;
  const proteinsPer100g = Math.max(0, nutriments.proteins_100g);
  const carbsPer100g = Math.max(0, nutriments.carbohydrates_100g);
  const fatPer100g = Math.max(0, nutriments.fat_100g);

  return {
    ingredient,
    productName: product.product_name?.trim() || ingredient.name,
    provider: product.provider ?? "OpenFoodFacts",
    grams,
    calories: caloriesPer100g * multiplier,
    protein: proteinsPer100g * multiplier,
    carbs: carbsPer100g * multiplier,
    fat: fatPer100g * multiplier,
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
