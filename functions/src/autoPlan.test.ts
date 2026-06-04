import { describe, expect, it } from "bun:test";

import { buildPlan, classifyEffort, type AllocatorMeal, type DayContext } from "./autoPlan";

function meal(partial: Partial<AllocatorMeal> & { id: string }): AllocatorMeal {
  return {
    type: "cook",
    mealSlots: ["breakfast", "lunch", "dinner"],
    time: 20,
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

  it("leaves a slot unfilled when the pool has nothing for it", () => {
    const plan = buildPlan({
      days: [day({ date: "2026-06-01" })],
      pool: [breakfast], // breakfast-only pool
      avoided: [],
    });
    expect(plan[0].meals.map((m) => m.slot)).toEqual(["breakfast"]);
  });
});
