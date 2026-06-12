import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { seedMeals } from "./data";
import type { Meal, MealSlot, RecipeIngredient } from "./types";

// Recipe content is canonical in Firestore (issue #123). The catalogue is
// hydrated once at bootstrap via `fetchRecipeCatalogue`; until then it falls back
// to the bundled seeds so synchronous lookups (mealById/getMealById) always
// resolve. Reviews/rating are owned by the recipeReviews collection, not the
// recipe doc, so they default to empty here.

let catalogue: Meal[] = seedMeals;

// Meals placed in an auto-generated plan (issue #66) that may not be in the
// hydrated catalogue — e.g. recommender gap-fill recipes. Registered so the
// synchronous mealById/getMealById lookups resolve plan slots without threading
// an extra lookup through every screen.
const planMeals = new Map<string, Meal>();

export function getRecipeCatalogue(): Meal[] {
  return catalogue;
}

export function setRecipeCatalogue(recipes: Meal[]): void {
  catalogue = recipes.length > 0 ? recipes : seedMeals;
}

export function registerPlanMeals(meals: Meal[]): void {
  for (const meal of meals) {
    if (meal && typeof meal.id === "string" && meal.id) planMeals.set(meal.id, meal);
  }
}

export function getPlanMeal(id: string): Meal | undefined {
  return planMeals.get(id);
}

// The user's session-local saved/created recipes (Discover saves + custom
// recipes). Registered so mealById/getMealById still resolve a recipe the user
// has saved even after its creator unpublishes it (removed from the public
// catalogue + recommender). Rebuilt on each call from the full saved set, so an
// unsaved recipe correctly stops resolving.
const sessionMeals = new Map<string, Meal>();

export function registerSessionMeals(meals: Meal[]): void {
  sessionMeals.clear();
  for (const meal of meals) {
    if (meal && typeof meal.id === "string" && meal.id) sessionMeals.set(meal.id, meal);
  }
}

export function getSessionMeal(id: string): Meal | undefined {
  return sessionMeals.get(id);
}

// Firestore documents may be missing array fields if written by a partial-update
// script (e.g. recalc-nutrition writes only { nutrition, updatedAt }). Guard all
// array fields so downstream `.some()`/`.filter()` calls never throw. Reject
// documents that are missing id or name — these are clearly partial writes.
function normalizeRecipe(raw: Record<string, unknown>): Meal | null {
  if (typeof raw.id !== "string" || !raw.id || typeof raw.name !== "string" || !raw.name) {
    return null;
  }
  return {
    ...(raw as unknown as Meal),
    ingredients: Array.isArray(raw.ingredients) ? (raw.ingredients as RecipeIngredient[]) : [],
    allergens: Array.isArray(raw.allergens) ? (raw.allergens as string[]) : [],
    mealSlots: Array.isArray(raw.mealSlots) ? (raw.mealSlots as MealSlot[]) : [],
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    instructions: Array.isArray(raw.instructions) ? (raw.instructions as string[]) : [],
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
  return Array.isArray(data)
    ? data.map(normalizeRecipe).filter((m): m is Meal => m !== null)
    : [];
}
