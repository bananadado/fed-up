import { describe, expect, test } from "bun:test";

import { estimateRecipeCost } from "./costEstimate";

describe("estimateRecipeCost", () => {
  test("returns 0 for an empty ingredient list", () => {
    expect(estimateRecipeCost([])).toBe(0);
  });

  test("estimates weight-based ingredients from per-100g prices", () => {
    // 200g chicken + 100g rice from the active Tesco-backed price table.
    expect(
      estimateRecipeCost([
        { name: "chicken", quantity: 200, unit: "g" },
        { name: "rice", quantity: 100, unit: "g" },
      ]),
    ).toBe(2.1);
  });

  test("estimates countable ingredients from per-item prices", () => {
    // Count units are converted to grams before applying active Tesco-backed prices.
    expect(
      estimateRecipeCost([
        { name: "egg", quantity: 2, unit: "item" },
        { name: "tortilla wrap", quantity: 1, unit: "wrap" },
      ]),
    ).toBe(1.1);
  });

  test("applies a per-recipe floor so a non-empty recipe never costs £0", () => {
    expect(estimateRecipeCost([{ name: "black pepper", quantity: 1, unit: "tsp" }])).toBe(0.3);
  });

  test("falls back to a default price for unknown ingredients", () => {
    // 100g of an unknown weight ingredient @ default £0.25/100g = £0.25
    expect(estimateRecipeCost([{ name: "mystery powder", quantity: 100, unit: "g" }])).toBe(0.25);
  });

  test("is deterministic for the same input", () => {
    const ingredients = [
      { name: "chicken", quantity: 250, unit: "g" },
      { name: "pepper", quantity: 1, unit: "item" },
    ];
    expect(estimateRecipeCost(ingredients)).toBe(estimateRecipeCost(ingredients));
  });
});
