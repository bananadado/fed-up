import { describe, expect, test } from "bun:test";

import { deadlineStressFromDeadlines, toPrototypeMeal } from "./recommenderApi";
import type { Deadline } from "./types";

function deadline(urgency: Deadline["urgency"], eventType: Deadline["eventType"] = "academic"): Deadline {
  return {
    id: `${eventType}-${urgency}`,
    title: "Test deadline",
    date: "Tue 2 Jun",
    time: "12:00",
    intensity: "Medium",
    eventType,
    effortHours: 3,
    urgency,
  };
}

describe("recommender API helpers", () => {
  test("converts academic deadline urgency into a bounded stress score", () => {
    expect(deadlineStressFromDeadlines([deadline("high"), deadline("medium")])).toBe(0.5);
    expect(deadlineStressFromDeadlines([deadline("high"), deadline("high"), deadline("high"), deadline("high")])).toBe(1);
  });

  test("ignores non-academic events", () => {
    expect(deadlineStressFromDeadlines([deadline("high", "general")])).toBe(0);
  });

  test("preserves recipe photos from recommendation responses", () => {
    const meal = toPrototypeMeal({
      id: "custom-123",
      name: "Uploaded recipe",
      meal_type: "cook",
      meal_slots: ["dinner"],
      price_pence: 250,
      prep_minutes: 20,
      dietary_tags: [],
      allergens: [],
      suitability_tags: ["quick"],
      ingredients: [],
      instructions: [],
      nutrition: null,
      source: "My recipes",
      note: null,
      photoUrl: "https://storage.googleapis.com/bucket/recipe-photos/custom.jpg",
    });

    expect(meal.photoUrl).toBe("https://storage.googleapis.com/bucket/recipe-photos/custom.jpg");
  });
});
