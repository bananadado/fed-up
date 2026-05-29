import type { Deadline, Meal, PlanEntry, Preferences } from "./types";

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
  };
}
