import { describe, expect, test } from "bun:test";

import { detectAdvancePrep, getPrepSuggestions } from "./advancePrep";
import type { Meal, PlanEntry } from "./types";

function makeMeal(overrides: Partial<Meal> & Pick<Meal, "id">): Meal {
  return {
    name: "Test meal",
    type: "cook",
    mealSlots: ["dinner"],
    time: 30,
    price: 1.5,
    tags: [],
    ingredients: [],
    allergens: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    rating: 0,
    reviews: [],
    instructions: [],
    source: "test",
    note: "",
    image: "",
    ...overrides,
  };
}

describe("detectAdvancePrep", () => {
  test("ignores the absorb sense 'soak up' (Clear Soup regression #issue)", () => {
    const meal = makeMeal({
      id: "clear-soup",
      name: "Clear Soup with Semolina Dumplings",
      instructions: [
        "Allow butter to come to room temperature before beating in a bowl.",
        "The cooked dumplings should never be left standing in the soup for too long, as they will \"soak up\" the soup and become softened.",
      ],
    });
    expect(detectAdvancePrep(meal)).toBeNull();
  });

  test("does not flag soaking without a lead-time cue", () => {
    const meal = makeMeal({
      id: "noodles",
      instructions: ["Boil or soak the noodles according to the pack."],
    });
    expect(detectAdvancePrep(meal)).toBeNull();
  });

  test("overnight takes precedence over soaking", () => {
    const meal = makeMeal({
      id: "beans",
      instructions: ["Soak the beans overnight."],
    });
    expect(detectAdvancePrep(meal)).toEqual({
      reason: "needs overnight prep",
      leadHours: 8,
    });
  });

  test("flags soaking when paired with an hours cue", () => {
    const meal = makeMeal({
      id: "chickpeas",
      instructions: ["Soak the chickpeas for 8 hours, then drain."],
    });
    expect(detectAdvancePrep(meal)).toEqual({
      reason: "needs soaking in advance",
      leadHours: 4,
    });
  });

  test("flags explicit pre-soak without other cues", () => {
    const meal = makeMeal({
      id: "rice",
      instructions: ["Pre-soak the rice, then rinse."],
    });
    expect(detectAdvancePrep(meal)).toEqual({
      reason: "needs soaking in advance",
      leadHours: 4,
    });
  });

  test("does not satisfy a soak with a cue from an unrelated sentence", () => {
    const meal = makeMeal({
      id: "cross-step",
      instructions: [
        "Leave the dough to rest for 2 hours.",
        "Serve hot; the bread will soak up the gravy.",
      ],
    });
    expect(detectAdvancePrep(meal)).toBeNull();
  });

  test("flags marinating", () => {
    const meal = makeMeal({
      id: "chicken",
      instructions: ["Marinate the chicken in soy sauce."],
    });
    expect(detectAdvancePrep(meal)).toEqual({
      reason: "benefits from marinating in advance",
      leadHours: 4,
    });
  });

  test("returns null for a recipe with no advance prep", () => {
    const meal = makeMeal({
      id: "plain",
      instructions: ["Fry the onions.", "Add tomatoes and simmer."],
    });
    expect(detectAdvancePrep(meal)).toBeNull();
  });
});

describe("getPrepSuggestions", () => {
  test("dedups by mealId and sets reminder to the day before", () => {
    const meal = makeMeal({
      id: "chickpeas",
      instructions: ["Soak the chickpeas for 8 hours."],
    });
    const plan: PlanEntry[] = [
      {
        day: "Sat 13 Jun",
        dateIso: "2026-06-13",
        context: "",
        meals: [{ slot: "dinner", mealId: "chickpeas" }],
      },
      {
        day: "Sun 14 Jun",
        dateIso: "2026-06-14",
        context: "",
        meals: [{ slot: "dinner", mealId: "chickpeas" }],
      },
    ];

    const suggestions = getPrepSuggestions(plan, [meal]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.prep.reason).toBe("needs soaking in advance");
    expect(suggestions[0]!.reminderDateIso).toBe("2026-06-12");
  });

  test("drops reminders whose evening-before date has passed", () => {
    const meal = makeMeal({
      id: "barramundi",
      instructions: ["Marinate the fish in Moroccan spices."],
    });
    const plan: PlanEntry[] = [
      {
        day: "Fri 12 Jun",
        dateIso: "2026-06-12", // reminder = 2026-06-11
        context: "",
        meals: [{ slot: "dinner", mealId: "barramundi" }],
      },
    ];
    // Today is the 13th: the 11th reminder is in the past.
    expect(getPrepSuggestions(plan, [meal], "2026-06-13")).toHaveLength(0);
  });

  test("keeps a reminder due today (boundary)", () => {
    const meal = makeMeal({
      id: "chickpeas",
      instructions: ["Soak the chickpeas for 8 hours."],
    });
    const plan: PlanEntry[] = [
      {
        day: "Sun 14 Jun",
        dateIso: "2026-06-14", // reminder = 2026-06-13
        context: "",
        meals: [{ slot: "dinner", mealId: "chickpeas" }],
      },
    ];
    expect(getPrepSuggestions(plan, [meal], "2026-06-13")).toHaveLength(1);
  });

  test("surfaces a later occurrence when an earlier one has expired", () => {
    const meal = makeMeal({
      id: "chickpeas",
      instructions: ["Soak the chickpeas for 8 hours."],
    });
    const plan: PlanEntry[] = [
      {
        day: "Fri 12 Jun",
        dateIso: "2026-06-12", // reminder 2026-06-11 — past
        context: "",
        meals: [{ slot: "dinner", mealId: "chickpeas" }],
      },
      {
        day: "Tue 16 Jun",
        dateIso: "2026-06-16", // reminder 2026-06-15 — future
        context: "",
        meals: [{ slot: "dinner", mealId: "chickpeas" }],
      },
    ];
    const suggestions = getPrepSuggestions(plan, [meal], "2026-06-13");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.reminderDateIso).toBe("2026-06-15");
  });

  test("omits meals with no advance prep", () => {
    const meal = makeMeal({
      id: "plain",
      instructions: ["Fry the onions."],
    });
    const plan: PlanEntry[] = [
      {
        day: "Sat 13 Jun",
        dateIso: "2026-06-13",
        context: "",
        meals: [{ slot: "dinner", mealId: "plain" }],
      },
    ];
    expect(getPrepSuggestions(plan, [meal])).toHaveLength(0);
  });
});
