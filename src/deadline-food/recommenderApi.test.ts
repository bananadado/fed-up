import { afterEach, describe, expect, test } from "bun:test";

import { deadlineStressFromDeadlines, fetchRecommenderRecommendations, resolveDeadlineStress, toMeal, unpublishRecommenderRecipe } from "./recommenderApi";
import type { Deadline } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function deadline(urgency: Deadline["urgency"], eventType: Deadline["eventType"] = "academic", rawDate?: string): Deadline {
  return {
    id: `${eventType}-${urgency}`,
    title: "Test deadline",
    date: "Tue 2 Jun",
    time: "12:00",
    intensity: "Medium",
    eventType,
    effortHours: 3,
    urgency,
    rawDate,
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

  test("resolveDeadlineStress uses the local heuristic when no deadline is dated", async () => {
    let fetched = false;
    globalThis.fetch = (() => { fetched = true; return Promise.reject(new Error("should not call")); }) as unknown as typeof fetch;

    const stress = await resolveDeadlineStress([deadline("high"), deadline("medium")]);
    expect(stress).toBe(0.5);
    expect(fetched).toBe(false);
  });

  test("resolveDeadlineStress prefers the backend per-day stress for dated deadlines", async () => {
    globalThis.fetch = (() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ today: "2099-01-01", horizon_days: 14, deadlines: [], events: [], days: [{ stress: 0.91 }] }),
    })) as unknown as typeof fetch;

    const stress = await resolveDeadlineStress([deadline("high", "academic", "2099-01-02")]);
    expect(stress).toBe(0.91);
  });

  test("resolveDeadlineStress falls back to the local heuristic on backend failure", async () => {
    globalThis.fetch = (() => Promise.resolve({ ok: false, status: 502, json: async () => ({}) })) as unknown as typeof fetch;

    const stress = await resolveDeadlineStress([deadline("high", "academic", "2099-01-02")]);
    expect(stress).toBe(deadlineStressFromDeadlines([deadline("high", "academic", "2099-01-02")]));
  });

  test("requests the provided recommendation batch size", async () => {
    const requestBodies: unknown[] = [];
    globalThis.fetch = ((_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }) as unknown as typeof fetch;

    await fetchRecommenderRecommendations({
      sessionId: "session-1",
      prefs: {
        dietary: [],
        allergens: ["Gluten", "Peanuts"],
        dislikes: ["Spicy food"],
        likes: ["High-protein meals"],
        budget: 20,
        maxTime: 30,
        cookingAbility: "basic",
        kitchen: "shared",
        university: "",
        postcode: "",
        availableIngredients: [],
        planningHorizonDays: 21,
        planRegenMode: "prompt",
        unitSystem: "metric",
        prepReminderTime: "22:00",
      },
      deadlines: [deadline("medium")],
      excludeIds: ["recipe-1"],
      count: 5,
    });

    expect(requestBodies[0]).toMatchObject({
      id: "session-1",
      allergens: ["gluten", "peanut"],
      dislikes: ["spicy food"],
      likes: ["high-protein meals"],
    });
    expect(requestBodies[1]).toMatchObject({
      user_id: "session-1",
      n: 5,
      exclude_ids: ["recipe-1"],
    });
  });

  test("normalizes capitalized dietary onboarding labels before user sync", async () => {
    const requestBodies: unknown[] = [];
    globalThis.fetch = ((_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }) as unknown as typeof fetch;

    await fetchRecommenderRecommendations({
      sessionId: "session-2",
      prefs: {
        dietary: ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free"],
        allergens: [],
        dislikes: [],
        likes: [],
        budget: 20,
        maxTime: 30,
        cookingAbility: "basic",
        kitchen: "shared",
        university: "",
        postcode: "",
        availableIngredients: [],
        planningHorizonDays: 21,
        planRegenMode: "prompt",
        unitSystem: "metric",
        prepReminderTime: "22:00",
      },
      deadlines: [deadline("medium")],
      excludeIds: [],
      count: 5,
    });

    expect(requestBodies[0]).toMatchObject({
      dietary_tags: ["vegetarian", "vegan", "gluten-free", "dairy-free"],
    });
  });

  test("preserves recipe photos from recommendation responses", () => {
    const meal = toMeal({
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

  test("maps the verified flag from the recommender payload", () => {
    const base = {
      id: "r1",
      name: "Recipe",
      meal_type: "cook",
      meal_slots: ["dinner"],
      price_pence: 250,
      prep_minutes: 20,
      dietary_tags: [],
      allergens: [],
      suitability_tags: [],
      ingredients: [],
      instructions: [],
      nutrition: null,
      source: null,
      note: null,
    };

    expect(toMeal({ ...base, verified: true }).verified).toBe(true);
    expect(toMeal({ ...base, verified: false }).verified).toBe(false);
    // Absent flag (older payloads) is treated as not verified.
    expect(toMeal(base).verified).toBe(false);
  });

  test("unpublishRecommenderRecipe posts the recipe id to the unpublish endpoint", async () => {
    let captured: { url: string; method?: string; body?: string } | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), method: init?.method, body: init?.body as string };
      return new Response(JSON.stringify({ recipeId: "custom-1", published: false }), { status: 200 });
    }) as typeof fetch;

    await unpublishRecommenderRecipe("custom-1");

    expect(captured!.url).toContain("/api/recommender/recipe/unpublish");
    expect(captured!.method).toBe("POST");
    expect(JSON.parse(captured!.body as string)).toEqual({ recipeId: "custom-1" });
  });
});
