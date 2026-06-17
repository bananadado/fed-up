import { describe, expect, it } from "bun:test";

import { buildPlan, classifyEffort, type AllocatorMeal, type DayContext } from "./autoPlan";
import { appRecipes } from "./generated/appData";

function meal(partial: Partial<AllocatorMeal> & { id: string }): AllocatorMeal {
  return {
    type: "cook",
    mealSlots: ["breakfast", "lunch", "dinner"],
    time: 20,
    pricePence: 200,
    tags: [],
    allergens: [],
    ingredients: [],
    ...partial,
  };
}

function day(partial: Partial<DayContext> & { date: string }): DayContext {
  return {
    stress: 0.3,
    free_evening: true,
    hard_deadlines: 0,
    recommended_constraints: { max_prep_minutes: 60 },
    ...partial,
  };
}

function appMealToAllocator(meal: (typeof appRecipes)[number]): AllocatorMeal {
  return {
    id: meal.id,
    type: meal.type,
    mealSlots: [...meal.mealSlots],
    time: meal.time,
    pricePence: Math.round(meal.price * 100),
    tags: [...meal.tags],
    allergens: [...meal.allergens],
    ingredients: meal.ingredients.map((ingredient) => ({ name: ingredient.name })),
  };
}

describe("classifyEffort", () => {
  it("treats fallbacks and remixes as minimal prep", () => {
    expect(classifyEffort(meal({ id: "a", type: "fallback" }))).toBe("minimal");
    expect(classifyEffort(meal({ id: "b", type: "remix" }))).toBe("minimal");
  });

  it("detects batch-friendly cooks from tags", () => {
    expect(classifyEffort(meal({ id: "c", tags: ["batch-friendly"] }))).toBe("batch");
  });

  it("treats quick / short cooks as minimal", () => {
    expect(classifyEffort(meal({ id: "d", time: 5 }))).toBe("minimal");
    expect(classifyEffort(meal({ id: "e", tags: ["quick"] }))).toBe("minimal");
  });

  it("falls back to a full cook otherwise", () => {
    expect(classifyEffort(meal({ id: "f", time: 30 }))).toBe("cook");
  });
});

describe("buildPlan", () => {
  const minimalMeal = meal({ id: "fall", type: "fallback", time: 4, mealSlots: ["lunch", "dinner"] });
  const batchMeal = meal({ id: "batch", tags: ["batch-friendly"], time: 25, mealSlots: ["dinner"] });
  const breakfast = meal({ id: "bfast", type: "cook", time: 8, mealSlots: ["breakfast"] });

  it("produces one entry per day with real dates and labels", () => {
    const plan = buildPlan({
      days: [day({ date: "2026-06-01" }), day({ date: "2026-06-02" })],
      pool: [breakfast, batchMeal, minimalMeal],
      avoided: [],
    });
    expect(plan).toHaveLength(2);
    expect(plan[0].dateIso).toBe("2026-06-01");
    expect(plan[0].day).toMatch(/Jun/);
  });

  it("chooses minimal-prep meals and respects the prep cap on busy days", () => {
    const plan = buildPlan({
      days: [day({ date: "2026-06-03", stress: 0.8, free_evening: false, hard_deadlines: 1, recommended_constraints: { max_prep_minutes: 15 } })],
      pool: [breakfast, batchMeal, minimalMeal],
      avoided: [],
    });
    const dinner = plan[0].meals.find((m) => m.slot === "dinner");
    expect(dinner?.mealId).toBe("fall"); // 25-min batch cook excluded by 15-min cap
    expect(plan[0].context).toContain("Deadline");
  });

  it("seeds leftovers from a relaxed-day batch cook onto a later busy day", () => {
    const plan = buildPlan({
      days: [
        day({ date: "2026-06-01", stress: 0.2 }), // relaxed -> batch cook dinner
        day({ date: "2026-06-02", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } }),
      ],
      pool: [breakfast, batchMeal, minimalMeal],
      avoided: [],
    });
    const cook = plan[0].meals.find((m) => m.slot === "dinner");
    expect(cook?.batchCook).toBe(true);
    const busyDinner = plan[1].meals.find((m) => m.slot === "dinner");
    expect(busyDinner?.leftoverOf).toBe("batch");
  });

  it("excludes meals that hit an allergen or dislike", () => {
    const nutty = meal({ id: "nutty", allergens: ["peanuts"], mealSlots: ["dinner"] });
    const safe = meal({ id: "safe", type: "fallback", time: 5, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.8 })],
      pool: [nutty, safe],
      avoided: ["Peanuts"],
    });
    const dinner = plan[0].meals.find((m) => m.slot === "dinner");
    expect(dinner?.mealId).toBe("safe");
  });

  it("fully enforces vegan requirements even when metadata is inconsistent", () => {
    const safeVegan = meal({
      id: "safe-vegan",
      type: "fallback",
      tags: ["vegan"],
      allergens: [],
      ingredients: [{ name: "lentils" }, { name: "rice" }],
      mealSlots: ["dinner"],
    });
    const eggTaggedVegan = meal({
      id: "egg-vegan",
      type: "fallback",
      tags: ["vegan"],
      allergens: ["eggs"],
      ingredients: [{ name: "egg noodles" }],
      mealSlots: ["dinner"],
    });
    const fishWithoutVeganFlag = meal({
      id: "fish",
      type: "fallback",
      tags: [],
      allergens: ["fish"],
      ingredients: [{ name: "tuna" }],
      mealSlots: ["dinner"],
    });
    const plantBasedButUntagged = meal({
      id: "untagged",
      type: "fallback",
      tags: [],
      allergens: [],
      ingredients: [{ name: "beans" }],
      mealSlots: ["dinner"],
    });

    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.8 })],
      pool: [eggTaggedVegan, fishWithoutVeganFlag, plantBasedButUntagged, safeVegan],
      avoided: [],
      dietary: ["Vegan"],
    });

    const dinner = plan[0].meals.find((m) => m.slot === "dinner");
    expect(dinner?.mealId).toBe("safe-vegan");
  });

  it("marks slots unfilled rather than violating vegan requirements", () => {
    const eggMeal = meal({
      id: "egg",
      tags: ["vegan"],
      allergens: ["eggs"],
      ingredients: [{ name: "egg" }],
      mealSlots: ["dinner"],
    });

    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.8 })],
      pool: [eggMeal],
      avoided: [],
      dietary: ["Vegan"],
    });

    expect(plan[0].meals).toEqual([]);
  });

  it("leaves a slot unfilled when the pool has nothing for it", () => {
    const plan = buildPlan({
      days: [day({ date: "2026-06-01" })],
      pool: [breakfast], // breakfast-only pool
      avoided: [],
    });
    expect(plan[0].meals.map((m) => m.slot)).toEqual(["breakfast"]);
  });

  it("does not allocate meals that would exceed the weekly budget", () => {
    const expensive = meal({ id: "expensive", type: "fallback", time: 4, pricePence: 600, mealSlots: ["dinner"] });
    const cheap = meal({ id: "cheap", type: "fallback", time: 6, pricePence: 250, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: [
        day({ date: "2026-06-01", stress: 0.8 }),
        day({ date: "2026-06-02", stress: 0.8 }),
        day({ date: "2026-06-03", stress: 0.8 }),
      ],
      pool: [expensive, cheap],
      avoided: [],
      weeklyBudgetPence: 500,
    });

    const dinners = plan.flatMap((entry) => entry.meals.filter((m) => m.slot === "dinner"));
    expect(dinners.map((m) => m.mealId)).toEqual(["cheap", "cheap"]);
  });

  it("paces spend across the week instead of blowing the budget on the first days", () => {
    const costly = meal({ id: "costly", type: "fallback", time: 4, pricePence: 400, mealSlots: ["dinner"] });
    const paced = meal({ id: "paced", type: "fallback", time: 6, pricePence: 100, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: Array.from({ length: 7 }, (_, i) =>
        day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.8 }),
      ),
      pool: [costly, paced],
      avoided: [],
      weeklyBudgetPence: 700,
    });

    const dinners = plan.flatMap((entry) => entry.meals.filter((m) => m.slot === "dinner"));
    expect(dinners).toHaveLength(7);
    expect(dinners.every((m) => m.mealId === "paced")).toBe(true);
  });

  it("paces across slots that can actually be filled", () => {
    const dinnerOnly = meal({ id: "dinner-only", pricePence: 285, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: Array.from({ length: 7 }, (_, i) =>
        day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.8 }),
      ),
      pool: [dinnerOnly],
      avoided: [],
      weeklyBudgetPence: 2100,
    });

    const dinners = plan.flatMap((entry) => entry.meals.filter((m) => m.slot === "dinner"));
    expect(dinners).toHaveLength(7);
    expect(dinners.every((m) => m.mealId === "dinner-only")).toBe(true);
  });

  it("leaves the plan empty when no saved, recommender, or generated recipes exist", () => {
    const plan = buildPlan({
      days: Array.from({ length: 7 }, (_, i) =>
        day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.3 }),
      ),
      pool: appRecipes.map(appMealToAllocator),
      avoided: [],
      weeklyBudgetPence: 4800,
    });

    expect(plan.flatMap((entry) => entry.meals)).toEqual([]);
  });

  it("does not keep choosing the same relaxed-day batch cook when alternatives exist", () => {
    const traybake = meal({ id: "traybake", tags: ["batch-friendly"], time: 20, pricePence: 120, mealSlots: ["dinner"] });
    const pasta = meal({ id: "pasta", time: 18, pricePence: 130, mealSlots: ["dinner"] });
    const noodles = meal({ id: "noodles", time: 16, pricePence: 140, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: Array.from({ length: 6 }, (_, i) =>
        day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.2 }),
      ),
      pool: [traybake, pasta, noodles],
      avoided: [],
      weeklyBudgetPence: 2000,
    });

    const dinnerIds = plan.map((entry) => entry.meals.find((m) => m.slot === "dinner")?.mealId);
    expect(dinnerIds.slice(0, 3)).toEqual(["traybake", "pasta", "noodles"]);
    expect(dinnerIds.filter((id) => id === "traybake")).toHaveLength(2);
  });

  it("rotates similarly suitable meals instead of repeating one meal across the horizon", () => {
    const days = Array.from({ length: 9 }, (_, i) =>
      day({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        stress: 0.8,
        recommended_constraints: { max_prep_minutes: 15 },
      }),
    );
    const quickA = meal({ id: "quick-a", type: "fallback", time: 5, pricePence: 120 });
    const quickB = meal({ id: "quick-b", type: "fallback", time: 6, pricePence: 130 });
    const quickC = meal({ id: "quick-c", type: "fallback", time: 7, pricePence: 140 });

    const plan = buildPlan({
      days,
      pool: [quickA, quickB, quickC],
      avoided: [],
      weeklyBudgetPence: 5000,
    });

    expect(plan[0].meals.map((m) => m.mealId)).toEqual(["quick-a", "quick-b", "quick-c"]);
    const dinnerIds = plan.map((entry) => entry.meals.find((m) => m.slot === "dinner")?.mealId);
    expect(new Set(dinnerIds)).toEqual(new Set(["quick-a", "quick-b", "quick-c"]));
  });
});

describe("generated recipe seed", () => {
  it("does not ship bundled app recipe fallbacks", () => {
    expect(appRecipes).toEqual([]);
  });
});
