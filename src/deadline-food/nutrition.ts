import type { Nutrition, NutritionMatch, RecipeIngredient } from "./types";
import { gramsForIngredient as ingredientGrams } from "@/domain/ingredientMeasurements";

export type OpenFoodFactsProduct = {
  product_name?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    energy_100g?: number;
    energy_unit?: string;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
};

export type IngredientNutritionEstimate = {
  ingredient: RecipeIngredient;
  productName: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function roundMacro(value: number) {
  return Math.max(0, Math.round(value));
}

export function gramsForIngredient(ingredient: RecipeIngredient) {
  return ingredientGrams(ingredient);
}

export function estimateIngredientNutrition(
  ingredient: RecipeIngredient,
  product: OpenFoodFactsProduct,
): IngredientNutritionEstimate | null {
  const nutriments = product.nutriments;
  const grams = gramsForIngredient(ingredient);
  const caloriesPer100g =
    typeof nutriments?.["energy-kcal_100g"] === "number"
      ? nutriments["energy-kcal_100g"]
      : nutriments?.energy_unit === "kJ" && typeof nutriments.energy_100g === "number"
        ? nutriments.energy_100g / 4.184
        : null;

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
    grams,
    calories: caloriesPer100g * multiplier,
    protein: nutriments.proteins_100g * multiplier,
    carbs: nutriments.carbohydrates_100g * multiplier,
    fat: nutriments.fat_100g * multiplier,
  };
}

export function totalNutritionFromEstimates(
  estimates: IngredientNutritionEstimate[],
  missingIngredients: string[],
  fetchedAt = new Date().toISOString(),
): Nutrition {
  const matches: NutritionMatch[] = estimates.map((estimate) => ({
    ingredient: estimate.ingredient.name,
    productName: estimate.productName,
    grams: roundMacro(estimate.grams),
  }));

  return {
    calories: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.calories, 0)),
    protein: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.protein, 0)),
    carbs: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.carbs, 0)),
    fat: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.fat, 0)),
    source: {
      provider: "OpenFoodFacts",
      label: "OpenFoodFacts estimate",
      fetchedAt,
      matchedIngredients: matches,
      missingIngredients,
    },
  };
}
