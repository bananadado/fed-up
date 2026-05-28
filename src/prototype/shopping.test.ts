import { describe, expect, test } from "bun:test";

import { aggregateIngredients, formatShoppingList, groceryVendorById, shoppingItemKey } from "./shopping";

describe("shopping helpers", () => {
  test("aggregates duplicate ingredients case-insensitively", () => {
    expect(aggregateIngredients(["oats", "Oats", "berries", " "])).toEqual([
      { name: "berries", count: 1 },
      { name: "oats", count: 2 },
    ]);
  });

  test("formats shopping list text for copying", () => {
    expect(formatShoppingList([
      { name: "berries", count: 1 },
      { name: "oats", count: 2 },
    ])).toBe("berries\noats x2");
  });

  test("normalises shopping item keys for checklist state", () => {
    expect(shoppingItemKey("  Oat Milk ")).toBe("oat milk");
  });

  test("builds selected vendor search URLs for one ingredient at a time", () => {
    expect(groceryVendorById("asda").searchUrl("oat milk")).toBe("https://groceries.asda.com/search/oat%20milk");
    expect(groceryVendorById("morrisons").searchUrl("berries")).toBe("https://groceries.morrisons.com/search?q=berries");
    expect(groceryVendorById("ocado").searchUrl("berries")).toBe("https://www.ocado.com/search?q=berries");
    expect(groceryVendorById("coop").searchUrl("berries")).toBe("https://shop.coop.co.uk/search?term=berries");
    expect(groceryVendorById("tesco").searchUrl("chia seeds")).toBe(
      "https://www.tesco.com/groceries/en-GB/search?query=chia%20seeds&inputType=free+text",
    );
  });
});
