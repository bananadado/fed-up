import type { CalendarEvent, CalendarProvider, Deadline, Meal, PlanEntry, Preferences } from "./types";

export const ANONYMOUS_SESSION_STORAGE_KEY = "deadlineFoodAnonymousSessionId";
export const PROTOTYPE_SESSION_SETTINGS_VERSION = 3;
export const PROTOTYPE_SESSION_RETENTION_DAYS = 90;

export type IcsSubscription = {
  url: string;
  source: CalendarProvider;
  addedAt: string;
};

export type CalendarToken = {
  provider: "google" | "outlook";
  refreshToken: string;
  expiresAt: string;
  addedAt: string;
};

export type PrototypeSessionSettings = {
  settingsVersion: typeof PROTOTYPE_SESSION_SETTINGS_VERSION;
  preferences: Preferences;
  deadlines: Deadline[];
  selectedSources: string[];
  onboarded: boolean;
  calendarProvider?: CalendarProvider;
  customRecipes?: Meal[];
  discoverSaved?: Meal[];
  discoverRejected?: Meal[];
  discoverReviewedRecipeIds?: string[];
  plan?: PlanEntry[];
  planMeals?: Meal[];
  calendarEvents?: CalendarEvent[];
  icsSubscriptions?: IcsSubscription[];
  calendarTokens?: CalendarToken[];
  /** Hash of the inputs the current plan was generated from (staleness detection). */
  planSignature?: string;
  /** ISO timestamp of the last auto-plan generation. */
  planGeneratedAt?: string;
  /** Whether the user explicitly skipped calendar import during onboarding. */
  calendarSkipped?: boolean;
};

/**
 * Fill in preference fields added after a session was first written (e.g. the
 * #66 planning-horizon settings) so restored sessions never carry `undefined`.
 */
export function normalizePreferences(raw: Preferences): Preferences {
  const horizon = Number.isFinite(raw.planningHorizonDays) ? raw.planningHorizonDays : 21;
  return {
    ...raw,
    planningHorizonDays: Math.min(28, Math.max(1, Math.round(horizon))),
    planRegenMode: raw.planRegenMode === "auto" ? "auto" : "prompt",
    prepReminderTime: /^\d{1,2}:\d{2}$/.test(raw.prepReminderTime ?? "") ? raw.prepReminderTime : "22:00",
  };
}

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
  calendarProvider?: CalendarProvider;
  customRecipes?: Meal[];
  discoverSaved?: Meal[];
  discoverRejected?: Meal[];
  discoverReviewedRecipeIds?: string[];
  plan?: PlanEntry[];
  planMeals?: Meal[];
  calendarEvents?: CalendarEvent[];
  icsSubscriptions?: IcsSubscription[];
  calendarTokens?: CalendarToken[];
  planSignature?: string;
  planGeneratedAt?: string;
  calendarSkipped?: boolean;
}): PrototypeSessionSettings {
  return {
    settingsVersion: PROTOTYPE_SESSION_SETTINGS_VERSION,
    preferences: input.preferences,
    deadlines: input.deadlines,
    selectedSources: input.selectedSources,
    onboarded: input.onboarded,
    calendarProvider: input.calendarProvider,
    customRecipes: input.customRecipes,
    discoverSaved: input.discoverSaved,
    discoverRejected: input.discoverRejected,
    discoverReviewedRecipeIds: input.discoverReviewedRecipeIds,
    plan: input.plan,
    planMeals: input.planMeals,
    calendarEvents: input.calendarEvents,
    icsSubscriptions: input.icsSubscriptions,
    calendarTokens: input.calendarTokens,
    planSignature: input.planSignature,
    planGeneratedAt: input.planGeneratedAt,
    calendarSkipped: input.calendarSkipped,
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
