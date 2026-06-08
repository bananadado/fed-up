import { describe, expect, test } from "bun:test";

import {
  createIngredientDraft,
  formatIngredient,
  parseIngredients,
  sanitiseIngredientDrafts,
  scaleIngredients,
} from "./ingredients";

describe("recipe ingredient helpers", () => {
  test("parses quantities and units from recipe input", () => {
    expect(parseIngredients("50g oats, 150ml oat milk, 1 item banana, 1 can chickpeas, 1 wrap, chopped tomato")).toEqual([
      { name: "oats", quantity: 50, unit: "g" },
      { name: "oat milk", quantity: 150, unit: "ml" },
      { name: "banana", quantity: 1, unit: "item" },
      { name: "chickpeas", quantity: 1, unit: "can" },
      { name: "tortilla wrap", quantity: 1, unit: "wrap" },
      { name: "tomato", quantity: 1, unit: "serving", preparation: "chopped" },
    ]);
  });

  test("formats stored ingredients for display", () => {
    expect(formatIngredient({ name: "oats", quantity: 50, unit: "g" })).toBe("50g oats");
    expect(formatIngredient({ name: "wrap", quantity: 1, unit: "wrap" })).toBe("1 wrap");
    expect(formatIngredient({ name: "bread", quantity: 2, unit: "slice" })).toBe("2 slices bread");
    expect(formatIngredient({ name: "egg", quantity: 2, unit: "item" })).toBe("2 eggs");
    expect(formatIngredient({ name: "chickpeas", quantity: 1, unit: "can" })).toBe("1 can chickpeas");
    expect(formatIngredient({ name: "tomato", quantity: 50, unit: "g", preparation: "chopped" })).toBe("50g chopped tomato");
  });

  test("sanitises structured ingredient drafts for OpenFoodFacts matching", () => {
    expect(
      sanitiseIngredientDrafts([
        createIngredientDraft({ name: "Chopped tomatoes", quantity: "250.555", unit: "g" }),
        createIngredientDraft({ name: "frozen peppers", quantity: "1/2", unit: "cup" }),
      ]),
    ).toEqual([
      { name: "tomato", quantity: 250.56, unit: "g", preparation: "chopped" },
      { name: "pepper", quantity: 0.5, unit: "cup", preparation: "frozen" },
    ]);
  });

  test("scales ingredient quantities by a serving factor", () => {
    expect(
      scaleIngredients(
        [
          { name: "oats", quantity: 50, unit: "g" },
          { name: "egg", quantity: 2, unit: "item" },
          { name: "tomato", quantity: 1, unit: "serving", preparation: "chopped" },
        ],
        2,
      ),
    ).toEqual([
      { name: "oats", quantity: 100, unit: "g" },
      { name: "egg", quantity: 4, unit: "item" },
      { name: "tomato", quantity: 2, unit: "serving", preparation: "chopped" },
    ]);
  });

  test("scaling by a fractional factor rounds and preserves units/preparation", () => {
    expect(scaleIngredients([{ name: "rice", quantity: 75, unit: "g" }], 0.5)).toEqual([
      { name: "rice", quantity: 37.5, unit: "g" },
    ]);
  });

  test("returns ingredients unchanged for a factor of 1 or an invalid factor", () => {
    const ingredients = [{ name: "oats", quantity: 50, unit: "g" }];
    expect(scaleIngredients(ingredients, 1)).toBe(ingredients);
    expect(scaleIngredients(ingredients, 0)).toBe(ingredients);
    expect(scaleIngredients(ingredients, Number.NaN)).toBe(ingredients);
  });
});
