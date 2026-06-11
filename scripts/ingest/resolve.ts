/**
 * Nutrition resolver. USDA FoodData Central is the source of truth: it indexes
 * generic cooking ingredients and matches them far more reliably than
 * OpenFoodFacts, a barcoded retail-product database whose category search
 * returns nonsense for plain ingredients (e.g. "baby lettuce leaves" → a banana
 * & apple muesli).
 *
 * OpenFoodFacts is therefore DISABLED by default. It can be re-enabled as a
 * fallback for USDA misses via `useOpenFoodFacts: true`, but be aware its
 * matches are noisy. Whichever source wins tags the product with its
 * `provider`, so downstream provenance stays honest.
 */

import type { OpenFoodFactsProduct } from "./openfoodfacts.ts";
import {
  curatedNutritionProductForIngredient,
  estimateIngredientNutrition,
  findProductForIngredient,
} from "./openfoodfacts.ts";
import { findUsdaProductForIngredient } from "./usda.ts";

export type ResolveOptions = {
  /** Delay after each USDA request (signed key allows 1,000+/hour). */
  usdaMs: number;
  /** Delay after each OpenFoodFacts request (search API ~10/min). */
  offMs: number;
  /** Fall back to OpenFoodFacts when USDA has no match. Default false. */
  useOpenFoodFacts: boolean;
};

export type ResolvedProduct = {
  product: OpenFoodFactsProduct | null;
  /** Whether OpenFoodFacts was consulted (i.e. USDA missed and fallback was on). */
  triedOff: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/**
 * Resolve a single ingredient to a per-100g product via USDA. When USDA misses
 * and `useOpenFoodFacts` is set, fall back to OpenFoodFacts; otherwise the
 * ingredient is reported as unmatched (no OFF noise enters the cache).
 */
export async function resolveIngredientProduct(
  name: string,
  options: ResolveOptions,
): Promise<ResolvedProduct> {
  const curated = curatedNutritionProductForIngredient(name);
  if (curated) return { product: curated, triedOff: false };

  const probe = { name, quantity: 100, unit: "g" };
  const usda = await findUsdaProductForIngredient(name, async () => {
    await sleep(options.usdaMs);
  });
  if (usda && estimateIngredientNutrition(probe, usda)) {
    return { product: usda, triedOff: false };
  }

  if (!options.useOpenFoodFacts) return { product: null, triedOff: false };

  const off = await findProductForIngredient(name, async () => {
    await sleep(options.offMs);
  });
  return { product: off, triedOff: true };
}
