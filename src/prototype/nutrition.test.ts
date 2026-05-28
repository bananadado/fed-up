import { describe, expect, test } from "bun:test";

import { estimateIngredientNutrition, totalNutritionFromEstimates } from "./nutrition";

describe("nutrition helpers", () => {
  test("scales OpenFoodFacts per-100g macros by stored quantity", () => {
    const estimate = estimateIngredientNutrition(
      { name: "oats", quantity: 50, unit: "g" },
      {
        product_name: "Rolled oats",
        nutriments: {
          "energy-kcal_100g": 370,
          proteins_100g: 13,
          carbohydrates_100g: 60,
          fat_100g: 7,
        },
      },
    );

    expect(estimate).toMatchObject({
      productName: "Rolled oats",
      grams: 50,
      calories: 185,
      protein: 6.5,
      carbs: 30,
      fat: 3.5,
    });
  });

  test("totals matched ingredients and records missing ingredients", () => {
    const nutrition = totalNutritionFromEstimates(
      [
        {
          ingredient: { name: "oats", quantity: 50, unit: "g" },
          productName: "Rolled oats",
          grams: 50,
          calories: 185,
          protein: 6.5,
          carbs: 30,
          fat: 3.5,
        },
      ],
      ["berries"],
      "2026-05-28T12:00:00.000Z",
    );

    expect(nutrition).toEqual({
      calories: 185,
      protein: 7,
      carbs: 30,
      fat: 4,
      source: {
        provider: "OpenFoodFacts",
        label: "OpenFoodFacts estimate",
        fetchedAt: "2026-05-28T12:00:00.000Z",
        matchedIngredients: [{ ingredient: "oats", productName: "Rolled oats", grams: 50 }],
        missingIngredients: ["berries"],
      },
    });
  });
});
