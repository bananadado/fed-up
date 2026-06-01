import { describe, expect, test } from "bun:test";

import { aggregateIngredients, formatShoppingList, groceryVendorById, ingredientsFromPlan, shoppingItemKey, shoppingItemLabel } from "./shopping";

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

  test("aggregates structured ingredients by canonical name and unit", () => {
    const items = aggregateIngredients([
      { name: "tomato", quantity: 100, unit: "g", preparation: "chopped" },
      { name: "tomato", quantity: 50, unit: "g", preparation: "sliced" },
      { name: "tomato", quantity: 1, unit: "serving" },
      { name: "pepper", quantity: 0.5, unit: "cup", preparation: "frozen" },
    ]);

    expect(items).toEqual([
      { name: "pepper", count: 1, quantity: 0.5, unit: "cup", preparations: ["frozen"] },
      { name: "tomato", count: 2, quantity: 150, unit: "g", preparations: ["chopped", "sliced"] },
      { name: "tomato", count: 1, quantity: 1, unit: "serving", preparations: undefined },
    ]);
    expect(items.map(shoppingItemLabel)).toEqual(["0.5 cups pepper", "150g tomato", "tomato"]);
    expect(formatShoppingList(items)).toBe("0.5 cups pepper\n150g tomato\ntomato");
  });

  test("normalises shopping item keys for checklist state", () => {
    expect(shoppingItemKey("  Oat Milk ")).toBe("oat milk");
    expect(shoppingItemKey({ name: "Tomato", count: 1, quantity: 100, unit: "g" })).toBe("tomato:g");
  });

  test("omits ingredients the user already has from plan shopping lists", () => {
    const plan = [{ day: "Mon", context: "Study day", meals: [{ slot: "breakfast" as const, mealId: "m9" }] }];

    expect(ingredientsFromPlan(plan, [], [{ name: "Oats", quantity: 50, unit: "g" }]).some((item) => item.name.toLowerCase() === "oats")).toBe(false);
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
