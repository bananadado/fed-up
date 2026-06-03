import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { seedMeals } from "./data";
import type { Meal } from "./types";

// Recipe content is canonical in Firestore (issue #123). The catalogue is
// hydrated once at bootstrap via `fetchRecipeCatalogue`; until then it falls back
// to the bundled seeds so synchronous lookups (mealById/getMealById) always
// resolve. Reviews/rating are owned by the recipeReviews collection, not the
// recipe doc, so they default to empty here.

let catalogue: Meal[] = seedMeals;

export function getRecipeCatalogue(): Meal[] {
  return catalogue;
}

export function setRecipeCatalogue(recipes: Meal[]): void {
  catalogue = recipes.length > 0 ? recipes : seedMeals;
}

function normalizeRecipe(raw: Record<string, unknown>): Meal {
  return {
    ...(raw as unknown as Meal),
    reviews: [],
    rating: 0,
  };
}

export async function fetchRecipeCatalogue(): Promise<Meal[]> {
  const url = firebaseFunctionUrl("deadlineFoodRecipes", "/api/deadline-food/recipes");
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`Recipe catalogue request failed with ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>[];
  return Array.isArray(data) ? data.map(normalizeRecipe) : [];
}
