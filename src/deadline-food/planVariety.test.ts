import { describe, expect, test } from "bun:test";

import { initialPreferences } from "./data";
import { repairPlanVariety } from "./planVariety";
import type { Meal, PlanEntry } from "./types";

function meal(partial: Partial<Meal> & { id: string }): Meal {
  return {
    type: "fallback",
    mealSlots: ["lunch", "dinner"],
    time: 5,
    price: 2,
    tags: ["vegetarian"],
    ingredients: [],
    allergens: [],
    nutrition: { calories: 500, protein: 20, carbs: 60, fat: 12 },
    rating: 0,
    reviews: [],
    instructions: [],
    source: "test",
    note: "",
    image: "meal",
    ...partial,
    id: partial.id,
    name: partial.name ?? partial.id,
  };
}

function mainMealIds(plan: PlanEntry[]): string[] {
  return plan.flatMap((entry) =>
    entry.meals.filter((plannedMeal) => plannedMeal.slot !== "breakfast").map((plannedMeal) => plannedMeal.mealId),
  );
}

function expectNoThreeInARow(ids: string[]) {
  for (let index = 2; index < ids.length; index += 1) {
    expect(ids[index] === ids[index - 1] && ids[index] === ids[index - 2]).toBe(false);
  }
}

function expectNoMoreThanThreePerWeek(plan: PlanEntry[]) {
  plan.forEach((_entry, dayIndex) => {
    const weekStart = Math.floor(dayIndex / 7) * 7;
    const counts = new Map<string, number>();
    plan.slice(weekStart, weekStart + 7).forEach((weekEntry) => {
      weekEntry.meals.filter((plannedMeal) => plannedMeal.slot !== "breakfast").forEach((plannedMeal) => {
        counts.set(plannedMeal.mealId, (counts.get(plannedMeal.mealId) ?? 0) + 1);
      });
    });
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(3);
  });
}

describe("repairPlanVariety", () => {
  test("repairs a backend plan that returns falafel for every lunch and dinner", () => {
    const falafel = meal({ id: "falafel" });
    const soup = meal({ id: "soup" });
    const noodles = meal({ id: "noodles" });
    const plan = Array.from({ length: 3 }, (_, index): PlanEntry => ({
      day: `Day ${index + 1}`,
      dateIso: `2026-06-${String(index + 1).padStart(2, "0")}`,
      context: "",
      meals: [
        { slot: "lunch", mealId: "falafel" },
        { slot: "dinner", mealId: "falafel" },
      ],
    }));

    const repaired = repairPlanVariety({
      plan,
      backendMeals: [falafel],
      savedRecipes: [],
      catalogueMeals: [falafel, soup, noodles],
      prefs: initialPreferences,
      variantSeed: 2,
    });

    const ids = mainMealIds(repaired.plan);
    expect(repaired.changed).toBe(true);
    expect(new Set(ids).size).toBeGreaterThan(1);
    expectNoThreeInARow(ids);
    expectNoMoreThanThreePerWeek(repaired.plan);
  });

  test("does not use meals that violate allergens while repairing variety", () => {
    const falafel = meal({ id: "falafel" });
    const peanutNoodles = meal({ id: "peanut-noodles", allergens: ["peanuts"] });
    const rice = meal({ id: "rice" });
    const plan: PlanEntry[] = [{
      day: "Day 1",
      dateIso: "2026-06-01",
      context: "",
      meals: [
        { slot: "lunch", mealId: "falafel" },
        { slot: "dinner", mealId: "falafel" },
        { slot: "lunch", mealId: "falafel" },
      ],
    }];

    const repaired = repairPlanVariety({
      plan,
      backendMeals: [falafel],
      savedRecipes: [],
      catalogueMeals: [falafel, peanutNoodles, rice],
      prefs: { ...initialPreferences, allergens: ["Peanuts"] },
      variantSeed: 1,
    });

    const ids = mainMealIds(repaired.plan);
    expect(ids).not.toContain("peanut-noodles");
    expect(ids).toContain("rice");
    expectNoThreeInARow(ids);
  });

  test("replaces a fourth non-breakfast use in the same week", () => {
    const falafel = meal({ id: "falafel" });
    const soup = meal({ id: "soup" });
    const noodles = meal({ id: "noodles" });
    const rice = meal({ id: "rice" });
    const plan = Array.from({ length: 4 }, (_, index): PlanEntry => ({
      day: `Day ${index + 1}`,
      dateIso: `2026-06-${String(index + 1).padStart(2, "0")}`,
      context: "",
      meals: [{ slot: "dinner", mealId: "falafel", ...(index === 0 ? { batchCook: true } : { leftoverOf: "falafel" }) }],
    }));

    const repaired = repairPlanVariety({
      plan,
      backendMeals: [falafel],
      savedRecipes: [],
      catalogueMeals: [falafel, soup, noodles, rice],
      prefs: initialPreferences,
      variantSeed: 3,
    });

    expect(repaired.changed).toBe(true);
    expectNoMoreThanThreePerWeek(repaired.plan);
    expect(repaired.plan.flatMap((entry) => entry.meals).filter((plannedMeal) => plannedMeal.mealId === "falafel")).toHaveLength(3);
  });

  test("keeps a repeated meal instead of leaving a hole when the pool has no alternative", () => {
    const falafel = meal({ id: "falafel" });
    const plan: PlanEntry[] = [{
      day: "Day 1",
      dateIso: "2026-06-01",
      context: "",
      meals: [
        { slot: "lunch", mealId: "falafel" },
        { slot: "dinner", mealId: "falafel" },
      ],
    }];

    const repaired = repairPlanVariety({
      plan,
      backendMeals: [falafel],
      savedRecipes: [],
      catalogueMeals: [falafel],
      prefs: initialPreferences,
      variantSeed: 1,
    });

    expect(mainMealIds(repaired.plan)).toEqual(["falafel", "falafel"]);
    expect(repaired.changed).toBe(false);
  });

  test("still drops a slot when the meal violates allergens and nothing safe exists", () => {
    const peanutNoodles = meal({ id: "peanut-noodles", allergens: ["peanuts"] });
    const plan: PlanEntry[] = [{
      day: "Day 1",
      dateIso: "2026-06-01",
      context: "",
      meals: [{ slot: "dinner", mealId: "peanut-noodles" }],
    }];

    const repaired = repairPlanVariety({
      plan,
      backendMeals: [peanutNoodles],
      savedRecipes: [],
      catalogueMeals: [peanutNoodles],
      prefs: { ...initialPreferences, allergens: ["Peanuts"] },
      variantSeed: 1,
    });

    expect(repaired.plan[0]?.meals).toHaveLength(0);
    expect(repaired.changed).toBe(true);
  });

  test("clears leftover flags whose batch-cook origin was repaired away", () => {
    const soup = meal({ id: "soup" });
    const falafel = meal({ id: "falafel" });
    const rice = meal({ id: "rice" });
    const plan: PlanEntry[] = [
      {
        day: "Day 1",
        dateIso: "2026-06-01",
        context: "",
        meals: [
          { slot: "lunch", mealId: "soup" },
          // Same-day duplicate, so the batch-cook origin gets replaced.
          { slot: "dinner", mealId: "soup", batchCook: true },
        ],
      },
      {
        day: "Day 2",
        dateIso: "2026-06-02",
        context: "",
        meals: [{ slot: "lunch", mealId: "soup", leftoverOf: "soup" }],
      },
    ];

    const repaired = repairPlanVariety({
      plan,
      backendMeals: [soup],
      savedRecipes: [],
      catalogueMeals: [soup, falafel, rice],
      prefs: initialPreferences,
      variantSeed: 1,
    });

    expect(repaired.changed).toBe(true);
    expect(repaired.plan[0]?.meals[1]?.mealId).not.toBe("soup");
    const keptLeftover = repaired.plan[1]?.meals[0];
    expect(keptLeftover?.mealId).toBe("soup");
    expect(keptLeftover?.leftoverOf).toBeUndefined();
  });
});
