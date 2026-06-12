import { describe, expect, test } from "bun:test";

import { mealHealthSignals, qualitativeTags } from "./healthSignals";
import type { Meal } from "./types";

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    name: "Test Meal",
    type: "cook",
    mealSlots: ["dinner"],
    time: 10,
    price: 2,
    tags: [],
    ingredients: [],
    allergens: [],
    nutrition: { calories: 400, protein: 10, carbs: 40, fat: 10 },
    rating: 0,
    reviews: [],
    instructions: [],
    source: "",
    note: "",
    image: "",
    ...overrides,
  };
}

describe("qualitativeTags", () => {
  test("drops a qualitative tag that duplicates a computed signal — nutritional wins", () => {
    const m = meal({ tags: ["vegetarian", "high protein"] });

    expect(qualitativeTags(m)).toEqual(["vegetarian"]);
    expect(mealHealthSignals(m)).toContain("high protein");
  });

  test("matches case-insensitively against computed signal labels", () => {
    // A meal with >= 20g protein/serving emits the lowercase "protein" signal;
    // a "Protein" qualitative tag duplicates it regardless of case.
    const m = meal({ tags: ["Protein"], nutrition: { calories: 400, protein: 30, carbs: 40, fat: 10 } });

    expect(mealHealthSignals(m)).toContain("protein");
    expect(qualitativeTags(m)).toEqual([]);
  });

  test("keeps tags that do not overlap with computed signals", () => {
    const m = meal({ tags: ["vegetarian", "quick"] });

    expect(qualitativeTags(m)).toEqual(["vegetarian", "quick"]);
  });
});
