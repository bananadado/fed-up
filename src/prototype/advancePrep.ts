import type { Meal, PlanEntry } from "./types";
import { getMealById } from "./utils";

export type AdvancePrepInfo = {
  reason: string;
  leadHours: number;
};

const OVERNIGHT_RE = /\bovernight\b/i;
const SOAK_RE = /\bsoak\b/i;
const MARINATE_RE = /\bmarinат|marinate\b/i;

export function detectAdvancePrep(meal: Meal): AdvancePrepInfo | null {
  const searchText = [meal.name, ...meal.tags, ...meal.instructions].join(" ");
  if (OVERNIGHT_RE.test(searchText)) {
    return { reason: "needs overnight prep", leadHours: 8 };
  }
  if (SOAK_RE.test(searchText)) {
    return { reason: "needs soaking in advance", leadHours: 4 };
  }
  if (MARINATE_RE.test(searchText)) {
    return { reason: "benefits from marinating in advance", leadHours: 4 };
  }
  return null;
}

export type PrepSuggestion = {
  meal: Meal;
  entry: PlanEntry;
  prep: AdvancePrepInfo;
  /** ISO date for the evening-before reminder event, if derivable from dateIso. */
  reminderDateIso: string | null;
};

/** Returns unique advance-prep suggestions from the plan (one per meal). */
export function getPrepSuggestions(
  plan: PlanEntry[],
  customRecipes: Meal[],
): PrepSuggestion[] {
  const seen = new Set<string>();
  const suggestions: PrepSuggestion[] = [];

  for (const entry of plan) {
    for (const planMeal of entry.meals) {
      if (seen.has(planMeal.mealId)) continue;
      const meal = getMealById(planMeal.mealId, customRecipes);
      const prep = detectAdvancePrep(meal);
      if (!prep) continue;
      seen.add(planMeal.mealId);

      let reminderDateIso: string | null = null;
      if (entry.dateIso) {
        const d = new Date(entry.dateIso + "T12:00:00");
        d.setDate(d.getDate() - 1);
        reminderDateIso = d.toISOString().slice(0, 10);
      }

      suggestions.push({ meal, entry, prep, reminderDateIso });
    }
  }

  return suggestions;
}
