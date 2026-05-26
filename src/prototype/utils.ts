import { seedMeals } from "./data";
import type { Meal } from "./types";

export function money(n: number) {
  return `£${n.toFixed(2)}`;
}

export function formatCookingLimit(minutes: number | null) {
  if (minutes === null) {
    return "Unlimited";
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours} hr${hours === 1 ? "" : "s"}` : `${hours} hr ${remainingMinutes} min`;
  }

  return `${minutes} min`;
}

export function mealById(id: string, customRecipes: Meal[]) {
  return [...customRecipes, ...seedMeals].find((meal) => meal.id === id);
}

export function getMealById(id: string, customRecipes: Meal[]) {
  const meal = mealById(id, customRecipes);

  if (!meal) {
    return seedMeals[0] as Meal;
  }

  return meal;
}
