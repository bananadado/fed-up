import { estimateRecipeCostPence } from "@/domain/ingredientCosting";
import type { RecipeIngredient } from "./types";

/**
 * Estimate a recipe's total cost in pounds from its structured ingredients.
 * The shared domain estimator returns pence so planner/recommender paths can
 * keep integer money values; the prototype editor displays pounds.
 */
export function estimateRecipeCost(ingredients: RecipeIngredient[]): number {
  const pence = estimateRecipeCostPence(ingredients);
  return Number((pence / 100).toFixed(2));
}
