import type { Meal, PlanEntry } from "./types";
import { getMealById } from "./utils";

export type ShoppingItem = {
  name: string;
  count: number;
};

function normaliseIngredient(value: string) {
  return value.trim().toLowerCase();
}

export function buildTescoSearchUrl(items: ShoppingItem[]) {
  const query = items.map((item) => item.name).join(" ");

  return `https://www.tesco.com/shop/en-GB/search?query=${encodeURIComponent(query)}`;
}

export function aggregateIngredients(ingredients: string[]) {
  const items = new Map<string, ShoppingItem>();

  ingredients.forEach((ingredient) => {
    const key = normaliseIngredient(ingredient);

    if (!key) {
      return;
    }

    const current = items.get(key);
    items.set(key, current ? { ...current, count: current.count + 1 } : { name: ingredient.trim(), count: 1 });
  });

  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function ingredientsFromPlan(plan: PlanEntry[], customRecipes: Meal[]) {
  return aggregateIngredients(
    plan.flatMap((entry) => entry.meals.flatMap((planMeal) => getMealById(planMeal.mealId, customRecipes).ingredients)),
  );
}
