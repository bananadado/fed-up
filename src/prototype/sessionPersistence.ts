import type { CalendarEvent, Deadline, Meal, PlanEntry, Preferences } from "./types";

export const ANONYMOUS_SESSION_STORAGE_KEY = "deadlineFoodAnonymousSessionId";
export const PROTOTYPE_SESSION_SETTINGS_VERSION = 1;
export const PROTOTYPE_SESSION_RETENTION_DAYS = 90;

export type PrototypeSessionSettings = {
  settingsVersion: typeof PROTOTYPE_SESSION_SETTINGS_VERSION;
  preferences: Preferences;
  deadlines: Deadline[];
  selectedSources: string[];
  onboarded: boolean;
  customRecipes?: Meal[];
  discoverSaved?: Meal[];
  discoverRejected?: Meal[];
  plan?: PlanEntry[];
  calendarEvents?: CalendarEvent[];
};

const sessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;

export function isAnonymousSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && sessionIdPattern.test(value);
}

export function createAnonymousSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
}

export function createPrototypeSessionSettings(input: {
  preferences: Preferences;
  deadlines: Deadline[];
  selectedSources: string[];
  onboarded: boolean;
  customRecipes?: Meal[];
  discoverSaved?: Meal[];
  discoverRejected?: Meal[];
  plan?: PlanEntry[];
  calendarEvents?: CalendarEvent[];
}): PrototypeSessionSettings {
  return {
    settingsVersion: PROTOTYPE_SESSION_SETTINGS_VERSION,
    preferences: input.preferences,
    deadlines: input.deadlines,
    selectedSources: input.selectedSources,
    onboarded: input.onboarded,
    customRecipes: input.customRecipes,
    discoverSaved: input.discoverSaved,
    discoverRejected: input.discoverRejected,
    plan: input.plan,
    calendarEvents: input.calendarEvents,
  };
}

const mealSlots = new Set(["breakfast", "lunch", "dinner"]);

function isPlanEntry(value: unknown): value is PlanEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  if (typeof entry.day !== "string" || typeof entry.context !== "string" || !Array.isArray(entry.meals)) {
    return false;
  }

  return entry.meals.every((meal) => {
    if (typeof meal !== "object" || meal === null || Array.isArray(meal)) {
      return false;
    }

    const planMeal = meal as Record<string, unknown>;

    return mealSlots.has(String(planMeal.slot)) && typeof planMeal.mealId === "string" && planMeal.mealId.length > 0;
  });
}

export function restorePrototypePlan(value: unknown, fallback: PlanEntry[]): PlanEntry[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const restoredPlan = value.filter(isPlanEntry);

  return restoredPlan.length > 0 ? restoredPlan : fallback;
}
