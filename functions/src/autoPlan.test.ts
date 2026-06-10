import { describe, expect, it } from "bun:test";

import { buildBestPlan, buildPlan, classifyEffort, localDaysFromContextEvents, mergeCalendarPressure, scorePlan, type AllocatorMeal, type DayContext } from "./autoPlan";
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
    nutrition: { calories: 650, protein: 30, carbs: 75, fat: 18 },
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
    nutrition: meal.nutrition,
  };
}

function lunchDinnerIds(plan: ReturnType<typeof buildPlan>): string[] {
  return plan.flatMap((entry) =>
    entry.meals.filter((plannedMeal) => plannedMeal.slot !== "breakfast").map((plannedMeal) => plannedMeal.mealId),
  );
}

function expectNoThreeConsecutiveLunchDinnerRepeats(plan: ReturnType<typeof buildPlan>): void {
  const ids = lunchDinnerIds(plan);
  for (let index = 2; index < ids.length; index += 1) {
    expect([ids[index - 2], ids[index - 1], ids[index]].every((id) => id === ids[index])).toBe(false);
  }
}

function maxWeeklyLunchDinnerUses(plan: ReturnType<typeof buildPlan>): number {
  let max = 0;
  plan.forEach((entry, dayIndex) => {
    const weekStart = Math.floor(dayIndex / 7) * 7;
    const counts = new Map<string, number>();
    plan.slice(weekStart, weekStart + 7).forEach((weekEntry) => {
      weekEntry.meals.filter((plannedMeal) => plannedMeal.slot !== "breakfast").forEach((plannedMeal) => {
        counts.set(plannedMeal.mealId, (counts.get(plannedMeal.mealId) ?? 0) + 1);
      });
    });
    max = Math.max(max, ...counts.values(), 0);
  });
  return max;
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

  it("does not create batch cooks when batch cooking is off", () => {
    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.2 })],
      pool: [breakfast, batchMeal, minimalMeal],
      avoided: [],
      planningPriorities: { batchCooking: "off" },
    });

    expect(plan.flatMap((entry) => entry.meals).some((m) => m.batchCook)).toBe(false);
  });

  it("high batch mode respects the weekly lunch/dinner repeat cap", () => {
    const days = [
      day({ date: "2026-06-01", stress: 0.2 }),
      day({ date: "2026-06-02", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } }),
      day({ date: "2026-06-03", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } }),
      day({ date: "2026-06-04", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } }),
    ];

    const balanced = buildPlan({
      days,
      pool: [breakfast, batchMeal, minimalMeal],
      avoided: [],
      planningPriorities: { batchCooking: "balanced" },
    });
    const high = buildPlan({
      days,
      pool: [breakfast, batchMeal, minimalMeal],
      avoided: [],
      planningPriorities: { batchCooking: "high" },
    });

    const leftoverCount = (plan: ReturnType<typeof buildPlan>) =>
      plan.flatMap((entry) => entry.meals).filter((m) => m.leftoverOf === "batch").length;

    expect(leftoverCount(balanced)).toBe(2);
    expect(leftoverCount(high)).toBeLessThanOrEqual(2);
    expectNoThreeConsecutiveLunchDinnerRepeats(high);
    expect(maxWeeklyLunchDinnerUses(high)).toBeLessThanOrEqual(3);
  });

  it("repeats one breakfast across weekday slots in repeat mode", () => {
    const otherBreakfast = meal({ id: "other-bfast", type: "cook", time: 7, mealSlots: ["breakfast"] });
    const plan = buildPlan({
      days: Array.from({ length: 5 }, (_, i) => day({ date: `2026-06-${String(i + 1).padStart(2, "0")}` })),
      pool: [breakfast, otherBreakfast, batchMeal, minimalMeal],
      avoided: [],
      planningPriorities: { breakfastRoutine: "repeat" },
    });

    const breakfastIds = plan.map((entry) => entry.meals.find((m) => m.slot === "breakfast")?.mealId);
    expect(new Set(breakfastIds)).toHaveLength(1);
  });

  it("rotates two breakfasts in rotate mode", () => {
    const otherBreakfast = meal({ id: "other-bfast", type: "cook", time: 7, mealSlots: ["breakfast"] });
    const plan = buildPlan({
      days: Array.from({ length: 4 }, (_, i) => day({ date: `2026-06-${String(i + 1).padStart(2, "0")}` })),
      pool: [breakfast, otherBreakfast, batchMeal, minimalMeal],
      avoided: [],
      planningPriorities: { breakfastRoutine: "rotate" },
    });

    const breakfastIds = plan.map((entry) => entry.meals.find((m) => m.slot === "breakfast")?.mealId);
    expect(new Set(breakfastIds)).toEqual(new Set(["bfast", "other-bfast"]));
    expect(breakfastIds[0]).toBe(breakfastIds[2]);
    expect(breakfastIds[1]).toBe(breakfastIds[3]);
    expect(breakfastIds[0]).not.toBe(breakfastIds[1]);
  });

  it("prefers ingredient overlap when ingredient reuse is high", () => {
    const lunchBase = meal({ id: "rice-lunch", type: "cook", mealSlots: ["lunch"], ingredients: [{ name: "rice" }] });
    const differentDinner = meal({ id: "pasta-dinner", type: "cook", mealSlots: ["dinner"], ingredients: [{ name: "pasta" }] });
    const overlapDinner = meal({ id: "rice-dinner", type: "cook", mealSlots: ["dinner"], ingredients: [{ name: "rice" }] });
    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.3 })],
      pool: [breakfast, lunchBase, differentDinner, overlapDinner],
      avoided: [],
      planningPriorities: { ingredientReuse: "high" },
    });

    expect(plan[0].meals.find((m) => m.slot === "dinner")?.mealId).toBe("rice-dinner");
  });

  it("uses matching ingredients before rotating otherwise similar meals", () => {
    const lunchBase = meal({ id: "bean-lunch", type: "cook", mealSlots: ["lunch"], ingredients: [{ name: "beans" }] });
    const overlapDinner = meal({ id: "bean-dinner", type: "cook", mealSlots: ["dinner"], ingredients: [{ name: "beans" }] });
    const unusedDinner = meal({ id: "unused-dinner", type: "cook", mealSlots: ["dinner"], ingredients: [{ name: "rice" }] });
    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.3 })],
      pool: [breakfast, lunchBase, unusedDinner, overlapDinner],
      avoided: [],
      planningPriorities: { ingredientReuse: "balanced" },
    });

    expect(plan[0].meals.find((m) => m.slot === "dinner")?.mealId).toBe("bean-dinner");
  });

  it("keeps busy-day meals minimal before applying repeat avoidance", () => {
    const quick = meal({ id: "quick", type: "fallback", time: 5, mealSlots: ["lunch", "dinner"] });
    const fullCook = meal({ id: "cook", type: "cook", time: 15, mealSlots: ["lunch", "dinner"] });
    const plan = buildPlan({
      days: [
        day({ date: "2026-06-01", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } }),
        day({ date: "2026-06-02", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } }),
      ],
      pool: [quick, fullCook],
      avoided: [],
    });

    expect(plan[1].meals.find((m) => m.slot === "lunch")?.mealId).toBe("quick");
  });

  it("excludes campus fallbacks when fallbacks are off", () => {
    const fallback = meal({ id: "campus", type: "fallback", time: 3, mealSlots: ["dinner"] });
    const cookMeal = meal({ id: "cook", type: "cook", time: 8, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.9, recommended_constraints: { max_prep_minutes: 15 } })],
      pool: [fallback, cookMeal],
      avoided: [],
      planningPriorities: { campusFallbacks: "off" },
    });

    expect(plan[0].meals.find((m) => m.slot === "dinner")?.mealId).toBe("cook");
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

  it("relaxes budget before violating hard main-meal variety", () => {
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
    expect(dinners.map((m) => m.mealId)).toEqual(["cheap", "cheap", "expensive"]);
    expectNoThreeConsecutiveLunchDinnerRepeats(plan);
  });

  it("paces spend but still breaks repeated main-meal streaks", () => {
    const costly = meal({ id: "costly", type: "fallback", time: 4, pricePence: 400, mealSlots: ["dinner"] });
    const paced = meal({ id: "paced", type: "fallback", time: 6, pricePence: 100, mealSlots: ["dinner"] });
    const backup = meal({ id: "backup", type: "fallback", time: 7, pricePence: 120, mealSlots: ["dinner"] });
    const plan = buildPlan({
      days: Array.from({ length: 7 }, (_, i) =>
        day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.8 }),
      ),
      pool: [costly, paced, backup],
      avoided: [],
      weeklyBudgetPence: 700,
    });

    const dinners = plan.flatMap((entry) => entry.meals.filter((m) => m.slot === "dinner"));
    expect(dinners).toHaveLength(7);
    expect(dinners.map((m) => m.mealId)).toContain("costly");
    expectNoThreeConsecutiveLunchDinnerRepeats(plan);
  });

  it("leaves slots unfilled rather than violating hard main-meal variety when no alternative exists", () => {
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
    expect(dinners).toHaveLength(2);
    expect(dinners.every((m) => m.mealId === "dinner-only")).toBe(true);
  });

  it("allocates from the canonical catalogue when recommender and saved recipes are absent", () => {
    const plan = buildPlan({
      days: Array.from({ length: 7 }, (_, i) =>
        day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.3 }),
      ),
      pool: appRecipes.map(appMealToAllocator),
      avoided: [],
      weeklyBudgetPence: 8000,
      planningPriorities: { campusFallbacks: "allowed" },
    });

    expect(plan.flatMap((entry) => entry.meals)).toHaveLength(21);
    expect(maxWeeklyLunchDinnerUses(plan)).toBeLessThanOrEqual(3);
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
    const quickD = meal({ id: "quick-d", type: "fallback", time: 8, pricePence: 150 });
    const quickE = meal({ id: "quick-e", type: "fallback", time: 9, pricePence: 160 });

    const plan = buildPlan({
      days,
      pool: [quickA, quickB, quickC, quickD, quickE],
      avoided: [],
      weeklyBudgetPence: 5000,
    });

    expect(plan[0].meals.map((m) => m.mealId)).toEqual(["quick-a", "quick-b", "quick-c"]);
    const dinnerIds = plan.map((entry) => entry.meals.find((m) => m.slot === "dinner")?.mealId);
    expect(new Set(dinnerIds.filter(Boolean)).size).toBeGreaterThanOrEqual(3);
    expect(maxWeeklyLunchDinnerUses(plan)).toBeLessThanOrEqual(3);
  });

  it("uses variant seeds to offer different similarly valid alternatives on regeneration", () => {
    const days = [day({ date: "2026-06-01", stress: 0.8, recommended_constraints: { max_prep_minutes: 15 } })];
    const pool = [
      meal({ id: "quick-a", type: "fallback", time: 5, mealSlots: ["dinner"] }),
      meal({ id: "quick-b", type: "fallback", time: 5, mealSlots: ["dinner"] }),
      meal({ id: "quick-c", type: "fallback", time: 5, mealSlots: ["dinner"] }),
    ];

    const first = buildPlan({ days, pool, avoided: [], variantSeed: 1 });
    const second = buildPlan({ days, pool, avoided: [], variantSeed: 3 });

    expect(first[0].meals.find((m) => m.slot === "dinner")?.mealId).not.toBe(
      second[0].meals.find((m) => m.slot === "dinner")?.mealId,
    );
  });

  it("does not repeat lunch or dinner more than two days in a row when alternatives exist", () => {
    const days = Array.from({ length: 5 }, (_, i) =>
      day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.8 }),
    );
    const quickA = meal({ id: "quick-a", type: "fallback", time: 5, mealSlots: ["lunch"] });
    const quickB = meal({ id: "quick-b", type: "fallback", time: 6, mealSlots: ["lunch"] });

    const plan = buildPlan({
      days,
      pool: [quickA, quickB],
      avoided: [],
    });

    const lunchIds = plan.map((entry) => entry.meals.find((m) => m.slot === "lunch")?.mealId);
    expect(lunchIds.slice(0, 3)).not.toEqual(["quick-a", "quick-a", "quick-a"]);
    expect(lunchIds.slice(0, 3)).not.toEqual(["quick-b", "quick-b", "quick-b"]);
    expectNoThreeConsecutiveLunchDinnerRepeats(plan);
  });

  it("applies the three-meal repeat rule across lunch and dinner as one sequence", () => {
    const days = [
      day({ date: "2026-06-01", stress: 0.8 }),
      day({ date: "2026-06-02", stress: 0.8 }),
    ];
    const falafel = meal({ id: "falafel", type: "fallback", time: 5, mealSlots: ["lunch", "dinner"] });
    const noodles = meal({ id: "noodles", type: "fallback", time: 6, mealSlots: ["lunch", "dinner"] });

    const plan = buildPlan({
      days,
      pool: [falafel, noodles],
      avoided: [],
    });

    expect(lunchDinnerIds(plan).slice(0, 3)).not.toEqual(["falafel", "falafel", "falafel"]);
    expectNoThreeConsecutiveLunchDinnerRepeats(plan);
  });

  it("does not use any lunch or dinner meal more than three times per week", () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      day({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, stress: 0.8 }),
    );
    const pool = ["falafel", "soup", "noodles", "rice", "chilli"].map((id, index) =>
      meal({ id, type: "fallback", time: 5 + index, mealSlots: ["lunch", "dinner"] }),
    );

    const plan = buildPlan({ days, pool, avoided: [] });

    expect(maxWeeklyLunchDinnerUses(plan)).toBeLessThanOrEqual(3);
    expectNoThreeConsecutiveLunchDinnerRepeats(plan);
  });

  it("lightly prefers liked ingredients and penalises dislikes without making them impossible", () => {
    const rice = meal({ id: "rice", mealSlots: ["dinner"], ingredients: [{ name: "rice" }] });
    const pasta = meal({ id: "pasta", mealSlots: ["dinner"], ingredients: [{ name: "pasta" }] });
    const liked = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.3 })],
      pool: [rice, pasta],
      avoided: [],
      preferred: ["pasta"],
    });
    const onlyDisliked = buildPlan({
      days: [day({ date: "2026-06-01", stress: 0.3 })],
      pool: [rice],
      avoided: [],
      disliked: ["rice"],
    });

    expect(liked[0].meals.find((m) => m.slot === "dinner")?.mealId).toBe("pasta");
    expect(onlyDisliked[0].meals.find((m) => m.slot === "dinner")?.mealId).toBe("rice");
  });
});

describe("buildBestPlan", () => {
  it("selects a plan with better protein and calorie fit when constraints are equal", () => {
    const days = [day({ date: "2026-06-01" })];
    const poorLunch = meal({
      id: "poor-lunch",
      mealSlots: ["lunch"],
      nutrition: { calories: 250, protein: 5, carbs: 40, fat: 6 },
    });
    const balancedLunch = meal({
      id: "balanced-lunch",
      mealSlots: ["lunch"],
      nutrition: { calories: 650, protein: 34, carbs: 70, fat: 18 },
    });

    const result = buildBestPlan({
      days,
      pool: [poorLunch, balancedLunch],
      avoided: [],
      candidateCount: 12,
      variantSeed: 4,
    });

    expect(result.plan[0].meals.find((m) => m.slot === "lunch")?.mealId).toBe("balanced-lunch");
    expect(result.quality.nutritionScore).toBeGreaterThan(0.8);
  });

  it("uses custom daily protein goals when scoring plans", () => {
    const days = [day({ date: "2026-06-01" })];
    const lowerProtein = meal({
      id: "lower-protein",
      mealSlots: ["lunch"],
      nutrition: { calories: 735, protein: 32, carbs: 80, fat: 18 },
    });
    const higherProtein = meal({
      id: "higher-protein",
      mealSlots: ["lunch"],
      nutrition: { calories: 735, protein: 60, carbs: 60, fat: 18 },
    });

    const result = buildBestPlan({
      days,
      pool: [lowerProtein, higherProtein],
      avoided: [],
      nutritionTargets: { dailyCalories: 2100, dailyProtein: 150 },
      candidateCount: 12,
      variantSeed: 4,
    });

    expect(result.plan[0].meals.find((m) => m.slot === "lunch")?.mealId).toBe("higher-protein");
  });

  it("treats nutrition as softer than weekly variety", () => {
    const days = Array.from({ length: 3 }, (_, index) =>
      day({ date: `2026-06-${String(index + 1).padStart(2, "0")}`, stress: 0.8 }),
    );
    const falafel = meal({
      id: "falafel",
      type: "fallback",
      time: 5,
      mealSlots: ["lunch", "dinner"],
      nutrition: { calories: 700, protein: 45, carbs: 70, fat: 20 },
    });
    const soup = meal({
      id: "soup",
      type: "fallback",
      time: 6,
      mealSlots: ["lunch", "dinner"],
      nutrition: { calories: 520, protein: 18, carbs: 70, fat: 12 },
    });
    const pasta = meal({
      id: "pasta",
      type: "fallback",
      time: 7,
      mealSlots: ["lunch", "dinner"],
      nutrition: { calories: 620, protein: 20, carbs: 85, fat: 14 },
    });

    const result = buildBestPlan({
      days,
      pool: [falafel, soup, pasta],
      avoided: [],
      nutritionTargets: { dailyCalories: 2100, dailyProtein: 120 },
      candidateCount: 12,
      variantSeed: 1,
    });

    expect(new Set(lunchDinnerIds(result.plan))).toEqual(new Set(["falafel", "soup", "pasta"]));
    expect(result.quality.nutritionScore).toBeLessThan(1);
    expect(result.quality.hardVarietyViolationCount).toBe(0);
  });

  it("scores compact shopping lists higher when nutrition and variety are comparable", () => {
    const days = [day({ date: "2026-06-01" }), day({ date: "2026-06-02" })];
    const riceBeans = meal({
      id: "rice-beans",
      mealSlots: ["dinner"],
      ingredients: [{ name: "rice" }, { name: "beans" }, { name: "pepper" }],
    });
    const riceWrap = meal({
      id: "rice-wrap",
      mealSlots: ["dinner"],
      ingredients: [{ name: "rice" }, { name: "beans" }, { name: "tortilla" }],
    });
    const pasta = meal({
      id: "pasta",
      mealSlots: ["dinner"],
      ingredients: [{ name: "pasta" }, { name: "tomato" }, { name: "cheese" }],
    });
    const noodles = meal({
      id: "noodles",
      mealSlots: ["dinner"],
      ingredients: [{ name: "noodles" }, { name: "mushroom" }, { name: "soy sauce" }],
    });

    const compact = [
      { day: "Mon 1 Jun", dateIso: "2026-06-01", context: "", meals: [{ slot: "dinner" as const, mealId: "rice-beans" }] },
      { day: "Tue 2 Jun", dateIso: "2026-06-02", context: "", meals: [{ slot: "dinner" as const, mealId: "rice-wrap" }] },
    ];
    const sprawling = [
      { day: "Mon 1 Jun", dateIso: "2026-06-01", context: "", meals: [{ slot: "dinner" as const, mealId: "pasta" }] },
      { day: "Tue 2 Jun", dateIso: "2026-06-02", context: "", meals: [{ slot: "dinner" as const, mealId: "noodles" }] },
    ];
    const input = { days, pool: [riceBeans, riceWrap, pasta, noodles], avoided: [] };

    expect(scorePlan(input, compact).shoppingSimplicityScore).toBeGreaterThan(scorePlan(input, sprawling).shoppingSimplicityScore);
    expect(scorePlan(input, compact).ingredientReuseScore).toBeGreaterThan(scorePlan(input, sprawling).ingredientReuseScore);
  });

  it("reports hard variety violations and poor coverage in plan quality", () => {
    const days = [day({ date: "2026-06-01" }), day({ date: "2026-06-02" })];
    const falafel = meal({ id: "falafel", mealSlots: ["lunch", "dinner"] });
    const badPlan = [
      {
        day: "Mon 1 Jun",
        dateIso: "2026-06-01",
        context: "",
        meals: [
          { slot: "lunch" as const, mealId: "falafel" },
          { slot: "dinner" as const, mealId: "falafel" },
        ],
      },
      {
        day: "Tue 2 Jun",
        dateIso: "2026-06-02",
        context: "",
        meals: [{ slot: "lunch" as const, mealId: "falafel" }],
      },
    ];

    const quality = scorePlan({ days, pool: [falafel], avoided: [] }, badPlan);

    expect(quality.hardVarietyViolationCount).toBe(1);
    expect(quality.maxConsecutiveLunchDinnerRepeats).toBe(3);
    expect(quality.coverageScore).toBe(0.5);
    expect(quality.varietyScore).toBe(0);
  });

  it("scores a fourth non-breakfast use in the same week as a hard variety violation", () => {
    const days = Array.from({ length: 4 }, (_, i) => day({ date: `2026-06-${String(i + 1).padStart(2, "0")}` }));
    const falafel = meal({ id: "falafel", mealSlots: ["dinner"] });
    const badPlan = days.map((d, index) => ({
      day: `Day ${index}`,
      dateIso: d.date,
      context: "",
      meals: [{ slot: "dinner" as const, mealId: "falafel" }],
    }));

    const quality = scorePlan({ days, pool: [falafel], avoided: [] }, badPlan);

    expect(quality.hardVarietyViolationCount).toBeGreaterThanOrEqual(1);
    expect(quality.varietyScore).toBe(0);
  });

  it("does not count leftover meals as extra shopping items", () => {
    const batch = meal({
      id: "batch",
      tags: ["batch-friendly"],
      mealSlots: ["dinner"],
      ingredients: [{ name: "rice" }, { name: "lentils" }, { name: "spinach" }],
    });
    const plan = [
      { day: "Mon 1 Jun", dateIso: "2026-06-01", context: "", meals: [{ slot: "dinner" as const, mealId: "batch", batchCook: true }] },
      { day: "Tue 2 Jun", dateIso: "2026-06-02", context: "", meals: [{ slot: "dinner" as const, mealId: "batch", leftoverOf: "batch" }] },
    ];

    const quality = scorePlan({ days: [day({ date: "2026-06-01" }), day({ date: "2026-06-02" })], pool: [batch], avoided: [] }, plan);

    expect(quality.uniqueIngredientCount).toBe(3);
  });

  it("reduces shopping item count for available ingredients", () => {
    const dinner = meal({
      id: "dinner",
      mealSlots: ["dinner"],
      ingredients: [{ name: "rice" }, { name: "beans" }, { name: "spinach" }],
    });
    const plan = [
      { day: "Mon 1 Jun", dateIso: "2026-06-01", context: "", meals: [{ slot: "dinner" as const, mealId: "dinner" }] },
    ];

    const quality = scorePlan({
      days: [day({ date: "2026-06-01" })],
      pool: [dinner],
      avoided: [],
      availableIngredients: [{ name: "rice" }],
    }, plan);

    expect(quality.uniqueIngredientCount).toBe(2);
  });

  it("targets moderate regeneration change on flexible meal slots", () => {
    const days = Array.from({ length: 7 }, (_, i) => day({ date: `2026-06-${String(i + 1).padStart(2, "0")}` }));
    const pool = [
      meal({ id: "a", mealSlots: ["dinner"] }),
      meal({ id: "b", mealSlots: ["dinner"] }),
      meal({ id: "c", mealSlots: ["dinner"] }),
      meal({ id: "d", mealSlots: ["dinner"] }),
    ];
    const previousPlan = days.map((d, index) => ({
      day: `Day ${index}`,
      dateIso: d.date,
      context: "",
      meals: [{ slot: "dinner" as const, mealId: pool[index % 4]!.id }],
    }));

    const result = buildBestPlan({
      days,
      pool,
      avoided: [],
      previousPlan,
      candidateCount: 16,
      variantSeed: 7,
    });

    expect(result.quality.changedFlexibleSlots).toBeGreaterThan(0);
    expect(result.quality.hardVarietyViolationCount).toBe(0);
  });

  it("preserves repeated breakfast routines while scoring candidate plans", () => {
    const days = Array.from({ length: 5 }, (_, i) => day({ date: `2026-06-${String(i + 1).padStart(2, "0")}` }));
    const bfastA = meal({ id: "bfast-a", mealSlots: ["breakfast"], nutrition: { calories: 450, protein: 22, carbs: 55, fat: 12 } });
    const bfastB = meal({ id: "bfast-b", mealSlots: ["breakfast"], nutrition: { calories: 450, protein: 22, carbs: 55, fat: 12 } });

    const result = buildBestPlan({
      days,
      pool: [bfastA, bfastB],
      avoided: [],
      planningPriorities: { breakfastRoutine: "repeat" },
      candidateCount: 12,
      variantSeed: 5,
    });

    const breakfasts = result.plan.map((entry) => entry.meals.find((m) => m.slot === "breakfast")?.mealId);
    expect(new Set(breakfasts)).toHaveLength(1);
  });
});

describe("localDaysFromContextEvents", () => {
  it("turns submitted workload events into busy day context when recommender context is unavailable", () => {
    const today = new Date().toISOString().slice(0, 10);
    const days = localDaysFromContextEvents(
      [
        {
          title: "Operating Systems coursework deadline",
          start: `${today}T18:00:00`,
          all_day: false,
        },
      ],
      3,
    );

    expect(days).toHaveLength(3);
    expect(days[0].stress).toBeGreaterThanOrEqual(0.8);
    expect(days[0].hard_deadlines).toBe(1);
    expect(days[0].free_evening).toBe(false);
    expect(days[0].recommended_constraints.max_prep_minutes).toBe(15);
  });

  it("keeps neutral days when submitted events fall outside the horizon", () => {
    const outside = new Date();
    outside.setDate(outside.getDate() + 10);
    const days = localDaysFromContextEvents(
      [
        {
          title: "Exam",
          start: outside.toISOString().slice(0, 10),
          all_day: true,
        },
      ],
      3,
    );

    expect(days.map((dayContext) => dayContext.stress)).toEqual([0.3, 0.3, 0.3]);
  });

  it("treats dense non-academic calendars as busy days", () => {
    const today = new Date().toISOString().slice(0, 10);
    const days = localDaysFromContextEvents(
      [
        { title: "Gym", start: `${today}T09:00:00`, end: `${today}T10:30:00` },
        { title: "Society meeting", start: `${today}T11:00:00`, end: `${today}T12:30:00` },
        { title: "Shift", start: `${today}T14:00:00`, end: `${today}T18:30:00` },
      ],
      3,
    );

    expect(days[0].stress).toBeGreaterThanOrEqual(0.8);
    expect(days[0].free_evening).toBe(false);
    expect(days[0].recommended_constraints.max_prep_minutes).toBe(15);
  });

  it("uses edited urgency and effort metadata from in-app workload entries", () => {
    const today = new Date().toISOString().slice(0, 10);
    const days = localDaysFromContextEvents(
      [
        {
          title: "Project work",
          start: `${today}T13:00:00`,
          event_type: "academic",
          urgency: "high",
          effort_hours: 7,
        },
      ],
      3,
    );

    expect(days[0].stress).toBeGreaterThanOrEqual(0.88);
    expect(days[0].hard_deadlines).toBe(1);
    expect(days[0].recommended_constraints.max_prep_minutes).toBe(15);
  });
});

describe("mergeCalendarPressure", () => {
  it("does not let weak recommender context downgrade a locally dense calendar day", () => {
    const today = new Date().toISOString().slice(0, 10);
    const merged = mergeCalendarPressure(
      [
        day({
          date: today,
          stress: 0.2,
          free_evening: true,
          hard_deadlines: 0,
          recommended_constraints: { max_prep_minutes: 60 },
        }),
      ],
      [
        { title: "Work block", start: `${today}T09:00:00`, end: `${today}T17:30:00` },
      ],
      1,
    );

    expect(merged[0].stress).toBeGreaterThanOrEqual(0.88);
    expect(merged[0].free_evening).toBe(false);
    expect(merged[0].recommended_constraints.max_prep_minutes).toBe(15);
  });
});
