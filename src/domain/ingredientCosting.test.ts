import { describe, expect, test } from "bun:test";

import {
  estimateIngredientCostPence,
  estimateRawMeasuresCostPence,
  estimateRecipeCostPence,
  findIngredientPriceRecord,
} from "./ingredientCosting";
import { gramsForIngredient, parseMeasureToIngredient } from "./ingredientMeasurements";

describe("ingredient measurements", () => {
  test("converts metric and imperial units to grams", () => {
    expect(gramsForIngredient({ name: "rice", quantity: 100, unit: "g" })).toBe(100);
    expect(gramsForIngredient({ name: "rice", quantity: 1, unit: "kg" })).toBe(1000);
    expect(gramsForIngredient({ name: "milk", quantity: 250, unit: "ml" })).toBe(250);
    expect(gramsForIngredient({ name: "milk", quantity: 1, unit: "l" })).toBe(1000);
    expect(gramsForIngredient({ name: "chicken", quantity: 450, unit: "grams boneless skin" })).toBe(450);
    expect(Math.round(gramsForIngredient({ name: "cheese", quantity: 2, unit: "oz" }))).toBe(57);
    expect(Math.round(gramsForIngredient({ name: "potatoes", quantity: 1, unit: "pound" }))).toBe(454);
  });

  test("converts cooking measures and count units", () => {
    expect(gramsForIngredient({ name: "oil", quantity: 1, unit: "tsp" })).toBe(5);
    expect(gramsForIngredient({ name: "soy sauce", quantity: 2, unit: "tbsp" })).toBe(30);
    expect(gramsForIngredient({ name: "soy sauce", quantity: 2, unit: "tblsp" })).toBe(30);
    expect(gramsForIngredient({ name: "oats", quantity: 0.5, unit: "cup" })).toBe(120);
    expect(Math.round(gramsForIngredient({ name: "milk", quantity: 1, unit: "pint" }))).toBe(568);
    expect(gramsForIngredient({ name: "chickpeas", quantity: 1, unit: "can" })).toBe(400);
    expect(gramsForIngredient({ name: "bread", quantity: 2, unit: "slice" })).toBe(80);
    expect(gramsForIngredient({ name: "tortilla wrap", quantity: 1, unit: "wrap" })).toBe(60);
    expect(gramsForIngredient({ name: "egg", quantity: 2, unit: "item" })).toBe(116);
    expect(gramsForIngredient({ name: "raw king prawns", quantity: 24, unit: "item" })).toBe(480);
    expect(gramsForIngredient({ name: "onion", quantity: 1, unit: "small" })).toBe(77);
    expect(gramsForIngredient({ name: "squid", quantity: 3, unit: "medium" })).toBe(450);
    expect(gramsForIngredient({ name: "bay leaf", quantity: 1, unit: "item" })).toBe(1);
    expect(gramsForIngredient({ name: "lime leaves", quantity: 8, unit: "item" })).toBe(1);
    expect(gramsForIngredient({ name: "lemongrass stalks", quantity: 2, unit: "item" })).toBe(80);
    expect(gramsForIngredient({ name: "cardamom", quantity: 6, unit: "item" })).toBeCloseTo(1.8);
    expect(gramsForIngredient({ name: "mystery", quantity: 1, unit: "serving" })).toBe(100);
  });

  test("parses raw non-standard recipe measures", () => {
    expect(parseMeasureToIngredient("oats", "1 1/2 cups")).toMatchObject({ quantity: 1.5, unit: "cup" });
    expect(parseMeasureToIngredient("onion", "½ cup")).toMatchObject({ quantity: 0.5, unit: "cup" });
    expect(parseMeasureToIngredient("red chilli powder", "¼ teaspoon")).toMatchObject({ quantity: 0.25, unit: "tsp" });
    expect(parseMeasureToIngredient("cheese", "2 oz")).toMatchObject({ quantity: 2, unit: "oz" });
    expect(parseMeasureToIngredient("tomatoes", "1 can")).toMatchObject({ quantity: 1, unit: "can" });
    expect(parseMeasureToIngredient("salt", "to taste")).toMatchObject({ quantity: 1, unit: "pinch" });
    expect(parseMeasureToIngredient("salt", "as required")).toMatchObject({ quantity: 1, unit: "pinch" });
    expect(parseMeasureToIngredient("onion", "1 small")).toMatchObject({ quantity: 1, unit: "small" });
    expect(gramsForIngredient(parseMeasureToIngredient("aubergine", "1 large"))).toBe(390);
  });
});

describe("ingredient costing", () => {
  test("matches aliases and estimates known ingredient cost from grams", () => {
    expect(findIngredientPriceRecord("halal chicken pieces")?.ingredient).toBe("chicken pieces");
    expect(estimateIngredientCostPence({ name: "halal chicken pieces", quantity: 100, unit: "g" }).pricePence).toBeCloseTo(55);
  });

  test("uses curated food prices ahead of bad generated Tesco product matches", () => {
    expect(findIngredientPriceRecord("lemon")?.source.source).not.toContain("Washing Up");
    expect(findIngredientPriceRecord("olive oil")?.source.source).not.toContain("Olly's");
    expect(findIngredientPriceRecord("chicken stock")?.pencePerGram).toBeLessThan(0.1);
  });

  test("converts count units to grams before pricing", () => {
    expect(estimateRecipeCostPence([{ name: "egg", quantity: 2, unit: "item" }])).toBe(80);
  });

  test("uses fallback pricing for unknown ingredients", () => {
    expect(estimateRecipeCostPence([{ name: "mystery powder", quantity: 100, unit: "g" }])).toBe(25);
  });

  test("rounds recipe totals to the nearest 5p with a non-empty floor", () => {
    expect(estimateRecipeCostPence([{ name: "black pepper", quantity: 1, unit: "pinch" }])).toBe(20);
  });

  test("estimates raw TheMealDB-style measures", () => {
    expect(
      estimateRawMeasuresCostPence([
        { name: "rice", measure: "1 1/2 cups" },
        { name: "cheese", measure: "2 oz" },
        { name: "tomatoes", measure: "1 can" },
        { name: "salt", measure: "to taste" },
      ]),
    ).toBeGreaterThan(0);
  });
});
