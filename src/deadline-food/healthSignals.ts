import type { Meal, PlanEntry } from "./types";
import { ingredientName } from "./ingredients";
import { getMealById } from "./utils";

const vegetableWords = ["pepper", "courgette", "broccoli", "spinach", "salad", "vegetables", "berries", "banana"];

export function mealHealthSignals(meal: Meal): string[] {
  const signals: string[] = [];
  const s = meal.servings ?? 1;

  if (meal.nutrition.protein / s >= 20) signals.push("protein");
  if (meal.ingredients.some((ingredient) => vegetableWords.some((word) => ingredientName(ingredient).toLowerCase().includes(word)))) signals.push("veg or fruit");
  if (meal.nutrition.fat / s <= 15) signals.push("lighter fat");
  if (meal.tags.includes("high protein")) signals.push("high protein");

  return [...new Set(signals)].slice(0, 3);
}

/**
 * Qualitative tags to render alongside computed nutrition signals. A tag whose
 * label also surfaces as a computed signal (e.g. "high protein") is dropped here
 * so it isn't rendered twice — the data-derived signal wins (#247).
 */
export function qualitativeTags(meal: Meal): string[] {
  const signals = new Set(mealHealthSignals(meal).map((s) => s.toLowerCase()));
  return meal.tags.filter((tag) => !signals.has(tag.trim().toLowerCase()));
}

export function weeklyBalanceSummary(plan: PlanEntry[], customRecipes: Meal[]): string {
  const meals = plan.flatMap((entry) => entry.meals.map((meal) => getMealById(meal.mealId, customRecipes)));
  const proteinMeals = meals.filter((meal) => meal.nutrition.protein / (meal.servings ?? 1) >= 20).length;
  const vegMeals = meals.filter((meal) => mealHealthSignals(meal).includes("veg or fruit")).length;

  return `${proteinMeals}/${meals.length} meals have a protein signal and ${vegMeals}/${meals.length} include fruit or veg.`;
}
