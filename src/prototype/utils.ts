import { seedMeals } from "./data";
import type { Meal } from "./types";

export function money(n: number) {
  return `£${n.toFixed(2)}`;
}

export function mealById(id: string, customRecipes: Meal[]) {
  return [...seedMeals, ...customRecipes].find((meal) => meal.id === id);
}

export function getMealById(id: string, customRecipes: Meal[]) {
  const meal = mealById(id, customRecipes);

  if (!meal) {
    return seedMeals[0] as Meal;
  }

  return meal;
}
