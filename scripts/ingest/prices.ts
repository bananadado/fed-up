/**
 * Shared UK ingredient price estimation wrappers for ingestion scripts.
 *
 * The canonical conversion and price table live under src/domain so the
 * prototype, recommender ingestion, and maintenance scripts use one model.
 */

import {
  estimateRawMeasuresCostPence,
  estimateRecipeCostPence,
} from "../../src/domain/ingredientCosting.ts";
import {
  gramsForIngredient,
  parseMeasureToIngredient,
} from "../../src/domain/ingredientMeasurements.ts";
import type { Ingredient } from "./types.ts";

/** Convert a TheMealDB measure string to approximate grams. */
export function measureToGrams(measure: string, ingredient: string): number {
  return gramsForIngredient(parseMeasureToIngredient(ingredient, measure));
}

/** Estimate total meal price in pence from raw TheMealDB ingredient measures. */
export function estimatePricePence(
  ingredients: Array<{ name: string; measure: string }>,
): number {
  return estimateRawMeasuresCostPence(ingredients);
}

/** Estimate total meal price in pence from stored structured ingredients. */
export function estimateStructuredPricePence(ingredients: Ingredient[]): number {
  return estimateRecipeCostPence(ingredients);
}
