import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { type ContextEventInput } from "./calendarImport";
import { deadlineToContextEvent } from "./calendarImport/deadlineContext";
import { getRecipeCatalogue, registerPlanMeals } from "./recipeCatalogue";
import { repairPlanVariety } from "./planVariety";
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
  /** Explicit regeneration variant; only affects backend tie-breaks. */
  planVariant?: number;
  previousPlan?: PlanEntry[];
  signal?: AbortSignal;
};

export type AutoPlanQuality = {
  score: number;
  coverageScore: number;
  nutritionScore: number;
  varietyScore: number;
  budgetScore: number;
  shoppingSimplicityScore: number;
  ingredientReuseScore: number;
  regenerationChangeScore: number;
  weeklyCostPence: number;
  uniqueIngredientCount: number;
  reusedIngredientGroups: number;
  changedFlexibleSlots: number;
  uniqueLunchDinnerCount: number;
  maxConsecutiveLunchDinnerRepeats: number;
  hardVarietyViolationCount: number;
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
}): string {
  const priorities = input.prefs.planningPriorities;
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
    `ce:${input.calendarEvents.map((e) => `${e.start}|${e.end}|${e.allDay}|${e.title}`).sort().join(",")}`,
    `dl:${input.deadlines.map((d) => `${d.rawDate ?? ""}|${d.time}|${d.title}|${d.eventType}|${d.urgency}|${d.effortHours}`).sort().join(",")}`,
    `pc:${priorities.batchCooking}`,
    `br:${priorities.breakfastRoutine}`,
    `mr:${priorities.mealRepeats}`,
    `ir:${priorities.ingredientReuse}`,
    `cf:${priorities.campusFallbacks}`,
    `nc:${input.prefs.nutritionGoals.dailyCalories}`,
    `np:${input.prefs.nutritionGoals.dailyProtein}`,
  ];
  return hash(parts.join(";"));
}

type AutoPlanResponse = {
  plan: PlanEntry[];
  meals: Meal[];
  quality?: AutoPlanQuality;
  generatedAt: string;
};

function contextEventKey(event: ContextEventInput): string {
  return `${event.start}|${event.title.trim().toLowerCase()}`;
}

export function buildAutoPlanContextEvents(calendarEvents: CalendarEvent[], deadlines: Deadline[]): ContextEventInput[] {
  const events: ContextEventInput[] = deadlines
    .map(deadlineToContextEvent)
    .filter((event): event is ContextEventInput => event !== null);

  for (const event of calendarEvents) {
    events.push({
    title: event.title,
    start: event.start,
    end: event.end || null,
    all_day: event.allDay,
    });
  }

  const seen = new Set<string>();
  return events.filter((event) => {
    const key = contextEventKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
): Promise<{ plan: PlanEntry[]; meals: Meal[]; generatedAt: string; quality?: AutoPlanQuality }> {
  const response = await fetch(firebaseFunctionUrl("deadlineFoodAutoPlan", "/api/deadline-food/auto-plan"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.sessionId,
      horizonDays: input.prefs.planningHorizonDays,
      budget: input.prefs.budget,
      contextEvents: buildAutoPlanContextEvents(input.calendarEvents, input.deadlines),
      savedRecipes: input.savedRecipes,
      excludeIds: input.excludeIds ?? [],
      planVariant: input.planVariant,
      previousPlan: input.previousPlan ?? [],
      dietary: input.prefs.dietary,
      likes: input.prefs.likes,
      dislikes: input.prefs.dislikes,
      allergens: input.prefs.allergens,
      nutritionGoals: input.prefs.nutritionGoals,
      planningPriorities: input.prefs.planningPriorities,
      availableIngredients: input.prefs.availableIngredients,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`Auto-plan request failed with ${response.status}`);
  }

  const data = (await response.json()) as AutoPlanResponse;
  const plan = Array.isArray(data.plan) ? data.plan : [];
  const meals = Array.isArray(data.meals) ? data.meals : [];
  const repaired = repairPlanVariety({
    plan,
    backendMeals: meals,
    savedRecipes: input.savedRecipes,
    catalogueMeals: getRecipeCatalogue(),
    prefs: input.prefs,
    variantSeed: input.planVariant,
  });
  registerPlanMeals(repaired.meals);
  return { plan: repaired.plan, meals: repaired.meals, generatedAt: data.generatedAt, quality: data.quality };
}
