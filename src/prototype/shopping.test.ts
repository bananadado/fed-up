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

  test("excludes water and variants from plan shopping lists", () => {
    const meal = {
      id: "water-meal",
      name: "Test Meal",
      type: "cook" as const,
      mealSlots: ["dinner" as const],
      time: 10,
      price: 2,
      tags: [],
      ingredients: [
        { name: "Pasta", quantity: 100, unit: "g" },
        { name: "Water", quantity: 500, unit: "ml" },
        { name: "Warm Water", quantity: 250, unit: "ml" },
      ],
      allergens: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      rating: 0,
      reviews: [],
      instructions: [],
      source: "",
      note: "",
      image: "",
    };
    const plan = [{ day: "Mon", context: "Test", meals: [{ slot: "dinner" as const, mealId: "water-meal" }] }];
    const items = ingredientsFromPlan(plan, [meal]);

    expect(items.some((item) => item.name.toLowerCase().includes("water"))).toBe(false);
    expect(items.some((item) => item.name === "pasta")).toBe(true);
  });

  test("merges same ingredient with different units via unit conversion in ingredientsFromPlan", () => {
    const mealA = {
      id: "meal-a",
      name: "Meal A",
      type: "cook" as const,
      mealSlots: ["lunch" as const],
      time: 15,
      price: 2,
      tags: [],
      ingredients: [{ name: "All purpose flour", quantity: 1, unit: "cup" }],
      allergens: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      rating: 0,
      reviews: [],
      instructions: [],
      source: "",
      note: "",
      image: "",
    };
    const mealB = { ...mealA, id: "meal-b", ingredients: [{ name: "All purpose flour", quantity: 4, unit: "tbsp" }] };
    const plan = [
      { day: "Mon", context: "Test", meals: [{ slot: "lunch" as const, mealId: "meal-a" }] },
      { day: "Tue", context: "Test", meals: [{ slot: "lunch" as const, mealId: "meal-b" }] },
    ];

    const items = ingredientsFromPlan(plan, [mealA, mealB], [], "metric");

    // Both flour entries should merge into a single ml entry
    const flourItems = items.filter((item) => item.name === "all purpose flour");
    expect(flourItems).toHaveLength(1);
    expect(flourItems[0]?.unit).toBe("ml");
  });

  test("aggregates plural and singular forms of the same ingredient", () => {
    const items = aggregateIngredients([
      { name: "Apple", quantity: 100, unit: "g" },
      { name: "apples", quantity: 50, unit: "g" },
      { name: "onions", quantity: 1, unit: "serving" },
      { name: "Onion", quantity: 2, unit: "serving" },
    ]);
    const apple = items.find((i) => i.name === "apple");
    expect(apple).toBeDefined();
    expect(apple?.quantity).toBe(150);
    expect(items.filter((i) => i.name.toLowerCase().includes("apple"))).toHaveLength(1);
    const onion = items.find((i) => i.name === "onion");
    expect(onion).toBeDefined();
    expect(onion?.count).toBe(2);
    expect(items.filter((i) => i.name.toLowerCase().includes("onion"))).toHaveLength(1);
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
