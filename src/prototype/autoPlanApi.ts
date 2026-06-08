import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { type ContextEventInput } from "./calendarImport";
import { deadlineToContextEvent } from "./calendarImport/deadlineContext";
import { registerPlanMeals } from "./recipeCatalogue";
import type { CalendarEvent, Deadline, Meal, PlanEntry, Preferences } from "./types";

export type GenerateAutoPlanInput = {
  sessionId: string;
  prefs: Preferences;
  /** Saved recipes (Discover saves + custom) — the primary candidate pool. */
  savedRecipes: Meal[];
  /** Imported calendar events; falls back to deadlines when empty. */
  calendarEvents: CalendarEvent[];
  deadlines: Deadline[];
  /** Recipe ids to keep out of the recommender gap-fill (e.g. rejected). */
  excludeIds?: string[];
  signal?: AbortSignal;
};

// Small deterministic FNV-1a hash so the signature stays short and stable
// (the backend caps the persisted signature length).
function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Fingerprint the inputs a plan is generated from. When this changes, the
 * current plan is stale and the user is prompted to regenerate (issue #66).
 */
export function computePlanSignature(input: {
  prefs: Preferences;
  savedRecipes: Meal[];
  calendarEvents: CalendarEvent[];
  deadlines: Deadline[];
  selectedSources: string[];
}): string {
  const parts = [
    `h:${input.prefs.planningHorizonDays}`,
    `t:${input.prefs.maxTime}`,
    `k:${input.prefs.kitchen}`,
    `a:${input.prefs.cookingAbility}`,
    `b:${input.prefs.budget}`,
    `dt:${[...input.prefs.dietary].sort().join(",")}`,
    `di:${[...input.prefs.dislikes].sort().join(",")}`,
    `al:${[...input.prefs.allergens].sort().join(",")}`,
    `sr:${input.savedRecipes.map((m) => m.id).sort().join(",")}`,
    `ce:${input.calendarEvents.map((e) => `${e.start}|${e.title}`).sort().join(",")}`,
    `dl:${input.deadlines.map((d) => `${d.rawDate ?? ""}|${d.urgency}`).sort().join(",")}`,
    `ss:${[...input.selectedSources].sort().join(",")}`,
  ];
  return hash(parts.join(";"));
}

type AutoPlanResponse = {
  plan: PlanEntry[];
  meals: Meal[];
  generatedAt: string;
};

function contextEvents(calendarEvents: CalendarEvent[], deadlines: Deadline[]): ContextEventInput[] {
  if (calendarEvents.length > 0) {
    return calendarEvents.map((event) => ({
      title: event.title,
      start: event.start,
      end: event.end || null,
      all_day: event.allDay,
    }));
  }
  return deadlines
    .map(deadlineToContextEvent)
    .filter((event): event is ContextEventInput => event !== null);
}

/**
 * Generate an auto-plan across the user's planning horizon. The cloud function
 * resolves calendar context (#65) and recommender ranking, then allocates meals
 * (batch cooks on relaxed days, leftovers/minimal prep on busy days). Returns
 * the plan plus the meals it placed, which are registered so screens can resolve
 * recommender gap-fill recipes synchronously via getMealById.
 */
export async function generateAutoPlan(
  input: GenerateAutoPlanInput,
): Promise<{ plan: PlanEntry[]; generatedAt: string }> {
  const response = await fetch(firebaseFunctionUrl("deadlineFoodAutoPlan", "/api/deadline-food/auto-plan"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.sessionId,
      horizonDays: input.prefs.planningHorizonDays,
      budget: input.prefs.budget,
      contextEvents: contextEvents(input.calendarEvents, input.deadlines),
      savedRecipes: input.savedRecipes,
      excludeIds: input.excludeIds ?? [],
      dietary: input.prefs.dietary,
      dislikes: input.prefs.dislikes,
      allergens: input.prefs.allergens,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`Auto-plan request failed with ${response.status}`);
  }

  const data = (await response.json()) as AutoPlanResponse;
  registerPlanMeals(Array.isArray(data.meals) ? data.meals : []);
  return { plan: Array.isArray(data.plan) ? data.plan : [], generatedAt: data.generatedAt };
}
