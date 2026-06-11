import { afterEach, describe, expect, test } from "bun:test";

import { initialPreferences } from "./data";
import { buildAutoPlanContextEvents, computePlanSignature, generateAutoPlan } from "./autoPlanApi";
import { eventDisplayFields } from "./calendarImport/eventsToDeadlines";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("computePlanSignature", () => {
  test("changes when planning priorities change", () => {
    const base = {
      prefs: initialPreferences,
      savedRecipes: [],
      calendarEvents: [],
      deadlines: [],
    };

    const changed = {
      ...base,
      prefs: {
        ...initialPreferences,
        planningPriorities: {
          ...initialPreferences.planningPriorities,
          breakfastRoutine: "varied" as const,
        },
      },
    };

    expect(computePlanSignature(base)).not.toBe(computePlanSignature(changed));
  });

  test("changes when nutrition goals change", () => {
    const base = {
      prefs: initialPreferences,
      savedRecipes: [],
      calendarEvents: [],
      deadlines: [],
    };

    const changed = {
      ...base,
      prefs: {
        ...initialPreferences,
        nutritionGoals: { dailyCalories: 2100, dailyProtein: 120 },
      },
    };

    expect(computePlanSignature(base)).not.toBe(computePlanSignature(changed));
  });
});

describe("buildAutoPlanContextEvents", () => {
  test("includes imported calendar events and in-app workload entries", () => {
    const events = buildAutoPlanContextEvents(
      [
        {
          id: "google-1",
          title: "Lecture",
          description: "",
          location: "",
          start: "2026-06-09T10:00:00",
          end: "2026-06-09T11:00:00",
          allDay: false,
          recurrence: "",
          source: "google",
          importedAt: "2026-06-08T12:00:00Z",
        },
      ],
      [
        {
          id: "manual-1",
          title: "Operating Systems coursework",
          date: "Tue 9 Jun",
          rawDate: "2026-06-09",
          time: "18:00",
          intensity: "High",
          eventType: "academic",
          effortHours: 6,
          urgency: "high",
        },
      ],
    );

    expect(events).toEqual([
      {
        title: "Operating Systems coursework",
        start: "2026-06-09T18:00:00",
        all_day: false,
        event_type: "academic",
        urgency: "high",
        effort_hours: 6,
      },
      { title: "Lecture", start: "2026-06-09T10:00:00", end: "2026-06-09T11:00:00", all_day: false },
    ]);
  });

  test("dedupes imported events that were also converted to workload rows", () => {
    const events = buildAutoPlanContextEvents(
      [
        {
          id: "google-1",
          title: "Coursework deadline",
          description: "",
          location: "",
          start: "2026-06-09T16:00:00",
          end: "",
          allDay: false,
          recurrence: "",
          source: "google",
          importedAt: "2026-06-08T12:00:00Z",
        },
      ],
      [
        {
          id: "cal-google-1",
          title: "Coursework deadline",
          date: "Tue 9 Jun",
          rawDate: "2026-06-09",
          time: "16:00",
          intensity: "High",
          eventType: "academic",
          effortHours: 6,
          urgency: "high",
        },
      ],
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ urgency: "high", effort_hours: 6 });
  });

  test("dedupes zoned calendar starts against local-clock workload rows", () => {
    // Real imports produce zoned starts (ICS) while deadline rows rebuild the
    // start from rawDate + local clock time — the key must match the instant.
    const calendarEvent = {
      id: "google-1",
      title: "Coursework deadline",
      description: "",
      location: "",
      start: "2026-06-09T15:00:00Z",
      end: "",
      allDay: false,
      recurrence: "",
      source: "google" as const,
      importedAt: "2026-06-08T12:00:00Z",
    };
    const fields = eventDisplayFields(calendarEvent, 1);

    const events = buildAutoPlanContextEvents(
      [calendarEvent],
      [
        {
          ...fields,
          intensity: "High",
          eventType: "academic",
          effortHours: 6,
          urgency: "high",
        },
      ],
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ urgency: "high", effort_hours: 6 });
  });
});

describe("generateAutoPlan", () => {
  test("sends previous plan and available ingredients and tolerates quality metadata", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          plan: [],
          meals: [],
          generatedAt: "2026-06-09T00:00:00Z",
          quality: { score: 0.9, changedFlexibleSlots: 2 },
        }),
      } as Response);
    }) as typeof fetch;

    const previousPlan = [
      {
        day: "Tue 9 Jun",
        dateIso: "2026-06-09",
        context: "",
        meals: [{ slot: "dinner" as const, mealId: "old-dinner" }],
      },
    ];
    const prefs = {
      ...initialPreferences,
      availableIngredients: [{ name: "rice", quantity: 500, unit: "g" }],
    };

    const result = await generateAutoPlan({
      sessionId: "session-1",
      prefs,
      savedRecipes: [],
      calendarEvents: [],
      deadlines: [],
      previousPlan,
      planVariant: 3,
    });

    expect(captured.body?.previousPlan).toEqual(previousPlan);
    expect(captured.body?.availableIngredients).toEqual(prefs.availableIngredients);
    expect(captured.body?.nutritionGoals).toEqual(prefs.nutritionGoals);
    expect(captured.body?.likes).toEqual(prefs.likes);
    expect(result.quality?.score).toBe(0.9);
  });
});
