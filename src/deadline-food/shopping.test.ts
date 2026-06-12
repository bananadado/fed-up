import { describe, expect, test } from "bun:test";

import { aggregateIngredients, estimateShoppingListCost, formatShoppingList, groceryVendorById, ingredientsFromPlan, scopePlanEntries, shoppingItemKey, shoppingItemLabel } from "./shopping";
import type { PlanEntry } from "./types";

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

  test("aggregates structured ingredients, merging count into weight via per-item weight", () => {
    const items = aggregateIngredients([
      { name: "tomato", quantity: 100, unit: "g", preparation: "chopped" },
      { name: "tomato", quantity: 50, unit: "g", preparation: "sliced" },
      { name: "tomato", quantity: 1, unit: "serving" },
      { name: "pepper", quantity: 0.5, unit: "cup", preparation: "frozen" },
    ]);

    // The serving-count tomato folds into the gram total using tomato's known
    // per-item weight (123g): 100 + 50 + 123 = 273g, one row instead of two.
    expect(items).toEqual([
      { name: "frozen pepper", count: 1, quantity: 118.3, unit: "ml" },
      { name: "tomato", count: 3, quantity: 273, unit: "g" },
    ]);
    expect(items.map(shoppingItemLabel)).toEqual(["118.3ml frozen pepper", "273g tomato"]);
    expect(formatShoppingList(items)).toBe("118.3ml frozen pepper\n273g tomato");
  });

  test("merges count-like unit variants of the same ingredient (#251 follow-up)", () => {
    // item / serving / whole are interchangeable "one whole unit" measures.
    const items = aggregateIngredients([
      { name: "cabbage", quantity: 2, unit: "item" },
      { name: "cabbage", quantity: 0.5, unit: "serving" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2.5);
    expect(shoppingItemLabel(items[0]!)).toBe("2.5 cabbages");
  });

  test("merges a counted produce item with its weighed form (#251 follow-up)", () => {
    // carrot has a known per-item weight (80g): 17 count → 1360g, + 907 = 2267g.
    const items = aggregateIngredients([
      { name: "carrots", quantity: 17, unit: "item" },
      { name: "carrot", quantity: 907, unit: "g" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.unit).toBe("kg");
    expect(items[0]?.quantity).toBe(2.27);
  });

  test("merges irregular plural / singular forms (bay leaf) (#251 follow-up)", () => {
    const items = aggregateIngredients([
      { name: "bay leaves", quantity: 2, unit: "item" },
      { name: "bay leaf", quantity: 4, unit: "item" },
    ]);
    expect(items).toHaveLength(1);
    expect(shoppingItemLabel(items[0]!)).toBe("6 bay leaves");
  });

  test("merges volume and weight of the same ingredient via density (#251 follow-up)", () => {
    // flour density ≈ 0.53 g/ml: 2700ml → 1431g, + 590g = 2021g.
    const items = aggregateIngredients([
      { name: "flour", quantity: 2.7, unit: "l" },
      { name: "flour", quantity: 590, unit: "g" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.unit).toBe("kg");
    expect(items[0]?.quantity).toBeCloseTo(2.02, 1);
  });

  test("drops a vague count of an uncountable food when a measured amount exists (#251 follow-up)", () => {
    const items = aggregateIngredients([
      { name: "oil", quantity: 369.7, unit: "ml" },
      { name: "oil", quantity: 1, unit: "serving" },
      { name: "oil", quantity: 1, unit: "serving" },
    ]);
    expect(items).toHaveLength(1);
    expect(shoppingItemLabel(items[0]!)).toBe("369.7ml oil");
  });

  test("shows an uncountable food with no measured amount as a bare name (#251 follow-up)", () => {
    const items = aggregateIngredients([
      { name: "plain flour", quantity: 1, unit: "serving" },
      { name: "plain flour", quantity: 1, unit: "serving" },
    ]);
    expect(items).toHaveLength(1);
    expect(shoppingItemLabel(items[0]!)).toBe("plain flour");
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

  test("omits a removed recipe's ingredients from the plan shopping list", () => {
    const meal = {
      id: "del-meal",
      name: "Deleted Meal",
      type: "cook" as const,
      mealSlots: ["dinner" as const],
      time: 10,
      price: 2,
      tags: [],
      ingredients: [{ name: "Rare Spice", quantity: 5, unit: "g" }],
      allergens: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      rating: 0,
      reviews: [],
      instructions: [],
      source: "",
      note: "",
      image: "",
    };
    const plan = [
      { day: "Mon", context: "Test", meals: [{ slot: "dinner" as const, mealId: "del-meal" }] },
    ];

    // Deleted by its owner: even though the local copy resolves, it contributes nothing.
    const withDeleted = ingredientsFromPlan(plan, [meal], [], "metric", new Set(["del-meal"]));
    expect(withDeleted.some((item) => item.name.toLowerCase().includes("rare spice"))).toBe(false);

    // An unresolvable id (own delete) is skipped without throwing.
    const missing = [{ day: "Mon", context: "Test", meals: [{ slot: "dinner" as const, mealId: "gone" }] }];
    expect(ingredientsFromPlan(missing, [])).toEqual([]);
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

  test("strips insignificant prep from name so chopped onion merges with onion", () => {
    const items = aggregateIngredients([
      { name: "chopped onion", quantity: 100, unit: "g" },
      { name: "Onion", quantity: 50, unit: "g" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("onion");
    expect(items[0]?.quantity).toBe(150);
  });

  test("keeps significant prep in key so frozen peas stay separate from plain peas", () => {
    const items = aggregateIngredients([
      { name: "frozen peas", quantity: 100, unit: "g" },
      { name: "peas", quantity: 50, unit: "g" },
    ]);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.name === "frozen pea")).toBe(true);
    expect(items.some((i) => i.name === "pea")).toBe(true);
  });

  test("normalises canned to tinned so they group together", () => {
    const items = aggregateIngredients([
      { name: "tinned tomatoes", quantity: 400, unit: "g" },
      { name: "canned tomatoes", quantity: 400, unit: "g" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("tinned tomato");
    expect(items[0]?.quantity).toBe(800);
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

  test("aggregates g and kg quantities together", () => {
    const items = aggregateIngredients([
      { name: "flour", quantity: 500, unit: "g" },
      { name: "flour", quantity: 1, unit: "kg" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("flour");
    expect(items[0]?.unit).toBe("kg");
    expect(items[0]?.quantity).toBe(1.5);
  });

  test("aggregates ml and l quantities together", () => {
    const items = aggregateIngredients([
      { name: "milk", quantity: 250, unit: "ml" },
      { name: "milk", quantity: 1, unit: "l" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.unit).toBe("l");
    expect(items[0]?.quantity).toBe(1.25);
  });

  test("converts aggregated grams to kg when total reaches 1000g", () => {
    const items = aggregateIngredients([
      { name: "rice", quantity: 600, unit: "g" },
      { name: "rice", quantity: 500, unit: "g" },
    ]);
    expect(items[0]?.unit).toBe("kg");
    expect(items[0]?.quantity).toBe(1.1);
  });

  test("keeps aggregated grams as g when total under 1000", () => {
    const items = aggregateIngredients([
      { name: "salt", quantity: 200, unit: "g" },
      { name: "salt", quantity: 300, unit: "g" },
    ]);
    expect(items[0]?.unit).toBe("g");
    expect(items[0]?.quantity).toBe(500);
  });

  test("merges unit aliases and compatible mass units onto one line", () => {
    const items = aggregateIngredients([
      { name: "flour", quantity: 1, unit: "cups" },
      { name: "flour", quantity: 4, unit: "tbsp" },
      { name: "sugar", quantity: 100, unit: "g" },
      { name: "sugar", quantity: 2, unit: "oz" },
    ]);
    expect(items.filter((i) => i.name === "flour")).toHaveLength(1);
    expect(items.filter((i) => i.name === "sugar")).toHaveLength(1);
    const sugar = items.find((i) => i.name === "sugar");
    expect(sugar?.unit).toBe("g");
    expect(sugar?.quantity).toBe(156.7); // 100g + 2oz (56.7g)
  });

  test("keeps mass and volume of the same ingredient on separate lines (unsafe to convert)", () => {
    const items = aggregateIngredients([
      { name: "parsley", quantity: 100, unit: "g" },
      { name: "parsley", quantity: 0.5, unit: "cup" },
    ]);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.unit === "g")).toBe(true);
    expect(items.some((i) => i.unit === "ml")).toBe(true);
  });

  test("merges compatible units in imperial mode and displays imperial units", () => {
    const mealA = {
      id: "imp-a",
      name: "Imp A",
      type: "cook" as const,
      mealSlots: ["lunch" as const],
      time: 15,
      price: 2,
      tags: [],
      ingredients: [{ name: "flour", quantity: 1, unit: "cup" }],
      allergens: [],
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      rating: 0,
      reviews: [],
      instructions: [],
      source: "",
      note: "",
      image: "",
    };
    const mealB = { ...mealA, id: "imp-b", ingredients: [{ name: "flour", quantity: 2, unit: "tbsp" }] };
    const plan = [
      { day: "Mon", context: "Test", meals: [{ slot: "lunch" as const, mealId: "imp-a" }] },
      { day: "Tue", context: "Test", meals: [{ slot: "lunch" as const, mealId: "imp-b" }] },
    ];

    const flour = ingredientsFromPlan(plan, [mealA, mealB], [], "imperial").filter((i) => i.name === "flour");
    expect(flour).toHaveLength(1);
    expect(flour[0]?.unit).toBe("cup");
    expect(flour[0]?.quantity).toBeCloseTo(1.13, 1);
  });

  test("merges descriptor-unit and prep-unit onion variants via ingredientsFromPlan", () => {
    const meal = {
      id: "onion-meal",
      name: "Onion Medley",
      type: "cook" as const,
      mealSlots: ["dinner" as const],
      time: 20,
      price: 1,
      tags: [],
      ingredients: [
        { name: "Onion", quantity: 2, unit: "medium" },
        { name: "Onion", quantity: 2, unit: "sliced" },
        { name: "Onion", quantity: 5, unit: "chopped" },
        { name: "Onion", quantity: 2, unit: "large" },
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
    const plan = [{ day: "Mon", context: "Test", meals: [{ slot: "dinner" as const, mealId: "onion-meal" }] }];
    const items = ingredientsFromPlan(plan, [meal]);

    const onionItems = items.filter((i) => i.name.includes("onion"));
    expect(onionItems).toHaveLength(1);
    expect(onionItems[0]?.quantity).toBe(11);
    expect(shoppingItemLabel(onionItems[0]!)).toBe("11 onions");
  });

  test("shoppingItemLabel uses natural plural for serving-unit items", () => {
    expect(shoppingItemLabel({ name: "tomato", count: 1, quantity: 3, unit: "serving" })).toBe("3 tomatoes");
    expect(shoppingItemLabel({ name: "onion", count: 1, quantity: 1, unit: "serving" })).toBe("onion");
    expect(shoppingItemLabel({ name: "berry", count: 1, quantity: 4, unit: "serving" })).toBe("4 berries");
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

describe("shopping scope", () => {
  const day = (n: number): PlanEntry => ({ day: `Day ${n}`, context: "", meals: [] });
  const plan = Array.from({ length: 10 }, (_, i) => day(i + 1));

  test("week scope keeps the first 7 day entries", () => {
    const scoped = scopePlanEntries(plan, "week");
    expect(scoped).toHaveLength(7);
    expect(scoped[0]?.day).toBe("Day 1");
    expect(scoped[6]?.day).toBe("Day 7");
  });

  test("all scope keeps the full plan", () => {
    expect(scopePlanEntries(plan, "all")).toHaveLength(10);
  });

  test("week scope tolerates plans shorter than the horizon", () => {
    const short = plan.slice(0, 3);
    expect(scopePlanEntries(short, "week")).toHaveLength(3);
  });
});

describe("estimateShoppingListCost", () => {
  test("returns 0 for an empty list", () => {
    expect(estimateShoppingListCost([])).toBe(0);
  });

  test("sums per-item estimates in pounds and grows with the list", () => {
    const small = estimateShoppingListCost([{ name: "rice", count: 1, quantity: 500, unit: "g" }]);
    const large = estimateShoppingListCost([
      { name: "rice", count: 1, quantity: 500, unit: "g" },
      { name: "chicken breast", count: 1, quantity: 600, unit: "g" },
    ]);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(Number(large.toFixed(2))).toBe(large);
  });

  test("estimates count-only items via a generic measure", () => {
    expect(estimateShoppingListCost([{ name: "onion", count: 3 }])).toBeGreaterThan(0);
  });
});
