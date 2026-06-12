import type { Meal, PlanEntry } from "./types";
import { getMealById } from "./utils";

export type AdvancePrepInfo = {
  reason: string;
  leadHours: number;
};

const OVERNIGHT_RE = /\bovernight\b/i;
const MARINATE_RE = /\bmarinate/i;

// The soak verb in any inflection. Bare matching is too broad on its own (e.g.
// "soak up the soup" is the absorb sense, not advance prep), so requiresSoaking
// pairs it with a lead-time cue and excludes the absorb phrasal verb.
const SOAK_RE = /\bsoak(?:s|ed|ing)?\b/i;
const SOAK_ABSORB_RE = /\bsoak(?:s|ed|ing)?\s+up\b/i;
const PRESOAK_RE = /\bpre-?soak/i;
// Cues that imply a meaningful amount of lead time before cooking.
const ADVANCE_CUE_RE =
  /\b(?:overnight|in advance|ahead of time|(?:a|the) day ahead|the night before|night before|the day before|day before|hours?|hrs?|soak(?:ing)? time)\b/i;

/**
 * True when the text actually describes soaking an ingredient in advance, rather
 * than the absorb sense ("soak up"). Scans sentence-by-sentence so a lead-time
 * cue in an unrelated step can't satisfy a soak elsewhere in the recipe.
 */
function requiresSoaking(text: string): boolean {
  for (const sentence of text.split(/[.!?\n]+/)) {
    if (!SOAK_RE.test(sentence)) continue;
    if (SOAK_ABSORB_RE.test(sentence)) continue; // "soak up" = absorb, not prep
    if (PRESOAK_RE.test(sentence)) return true; // explicit advance prep
    if (ADVANCE_CUE_RE.test(sentence)) return true; // soak + lead-time cue
  }
  return false;
}

export function detectAdvancePrep(meal: Meal): AdvancePrepInfo | null {
  const searchText = [meal.name, ...meal.tags, ...meal.instructions].join(" ");
  if (OVERNIGHT_RE.test(searchText)) {
    return { reason: "needs overnight prep", leadHours: 8 };
  }
  if (requiresSoaking(searchText)) {
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
