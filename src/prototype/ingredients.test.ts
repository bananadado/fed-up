import { describe, expect, test } from "bun:test";

import {
  createIngredientDraft,
  formatIngredient,
  parseIngredients,
  sanitiseIngredientDrafts,
} from "./ingredients";

describe("recipe ingredient helpers", () => {
  test("parses quantities and units from recipe input", () => {
    expect(parseIngredients("50g oats, 150ml oat milk, 1 wrap, chopped tomato")).toEqual([
      { name: "oats", quantity: 50, unit: "g" },
      { name: "oat milk", quantity: 150, unit: "ml" },
      { name: "tortilla wrap", quantity: 1, unit: "wrap" },
      { name: "tomato", quantity: 1, unit: "serving", preparation: "chopped" },
    ]);
  });

  test("formats stored ingredients for display", () => {
    expect(formatIngredient({ name: "oats", quantity: 50, unit: "g" })).toBe("50g oats");
    expect(formatIngredient({ name: "wrap", quantity: 1, unit: "wrap" })).toBe("1 wrap");
    expect(formatIngredient({ name: "bread", quantity: 2, unit: "slice" })).toBe("2 slices bread");
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
});
