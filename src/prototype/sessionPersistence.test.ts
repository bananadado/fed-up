import { describe, expect, test } from "bun:test";

import { initialPreferences } from "./data";
import type { PlanEntry } from "./types";
import {
  createPrototypeSessionSettings,
  isAnonymousSessionId,
  normalizePreferences,
  PROTOTYPE_SESSION_SETTINGS_VERSION,
  restorePrototypePlan,
} from "./sessionPersistence";

describe("anonymous prototype session persistence", () => {
  test("accepts generated UUID-style anonymous session IDs", () => {
    expect(isAnonymousSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAnonymousSessionId("bad/session/id")).toBe(false);
    expect(isAnonymousSessionId("short")).toBe(false);
  });

  test("wraps user settings with the current storage schema version", () => {
    const settings = createPrototypeSessionSettings({
      preferences: initialPreferences,
      deadlines: [],
      selectedSources: ["budget", "campus"],
      onboarded: true,
      discoverReviewedRecipeIds: ["m1", "m2"],
    });

    expect(settings.settingsVersion).toBe(PROTOTYPE_SESSION_SETTINGS_VERSION);
    expect(settings.preferences).toEqual(initialPreferences);
    expect(settings.selectedSources).toEqual(["budget", "campus"]);
    expect(settings.onboarded).toBe(true);
    expect(settings.discoverReviewedRecipeIds).toEqual(["m1", "m2"]);
  });

  test("normalizes missing planning priorities for older sessions", () => {
    const legacyPreferences = { ...initialPreferences };
    delete (legacyPreferences as Partial<typeof initialPreferences>).planningPriorities;

    expect(normalizePreferences(legacyPreferences).planningPriorities).toEqual({
      batchCooking: "balanced",
      breakfastRoutine: "repeat",
      mealRepeats: "balanced",
      ingredientReuse: "balanced",
      campusFallbacks: "when-busy",
    });
  });

  test("falls back when persisted plan data is empty or malformed", () => {
    const fallbackPlan = [
      {
        day: "Mon",
        context: "Fallback day",
        meals: [{ slot: "breakfast" as const, mealId: "m9" }],
      },
    ];

    expect(restorePrototypePlan([], fallbackPlan)).toEqual(fallbackPlan);
    expect(restorePrototypePlan([{ day: "Broken", context: "Missing meals" }], fallbackPlan)).toEqual(fallbackPlan);
  });

  test("restores structurally valid persisted plan data", () => {
    const fallbackPlan = [
      {
        day: "Mon",
        context: "Fallback day",
        meals: [{ slot: "breakfast" as const, mealId: "m9" }],
      },
    ];
    const persistedPlan: PlanEntry[] = [
      {
        day: "Tue",
        context: "Saved day",
        meals: [{ slot: "dinner", mealId: "m1", rescued: true }],
      },
    ];

    expect(restorePrototypePlan(persistedPlan, fallbackPlan)).toEqual(persistedPlan);
  });
});
