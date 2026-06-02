import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { seedMeals } from "./data";
import type { Deadline, Meal, Preferences, RecipeIngredient } from "./types";

type RecommenderRecipe = {
  id: string;
  name: string;
  meal_type: string;
  meal_slots: string[];
  price_pence: number;
  prep_minutes: number;
  dietary_tags: string[];
  allergens: string[];
  suitability_tags: string[];
  ingredients: RecipeIngredient[];
  instructions: string[];
  nutrition: Meal["nutrition"] | null;
  source: string | null;
  note: string | null;
};

type ScoredRecipe = {
  recipe: RecommenderRecipe;
  score: number;
  breakdown: Record<string, number>;
};

export type RecommenderInteractionAction = "swipe_left" | "swipe_right";

const seedMealIds = new Set(seedMeals.map((meal) => meal.id));

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function functionUrl(functionName: string, localPath: string): string {
  return firebaseFunctionUrl(functionName, localPath);
}

function cookingAbility(ability: string): string {
  return ability || "basic";
}

export function deadlineStressFromDeadlines(deadlines: Deadline[]): number {
  const total = deadlines
    .filter((deadline) => deadline.eventType === "academic")
    .reduce((sum, deadline) => {
      if (deadline.urgency === "high") return sum + 1;
      if (deadline.urgency === "medium") return sum + 0.5;
      return sum + 0.2;
    }, 0);

  return Math.min(1, total / 3);
}

export async function syncRecommenderUser(sessionId: string, prefs: Preferences): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecommenderUser", "/api/recommender/user"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: sessionId,
      cooking_ability: cookingAbility(prefs.cookingAbility),
      kitchen_access: prefs.kitchen,
      budget_pence: Math.round(prefs.budget * 100),
      max_time_minutes: prefs.maxTime ?? 240,
      dietary_tags: prefs.dietary,
      allergens: prefs.allergens,
      dislikes: prefs.dislikes,
      likes: prefs.likes,
      university: prefs.university || null,
      postcode: prefs.postcode || null,
    }),
  });

  await readJson(response, "Recommender user sync");
}

/**
 * Push a user-created recipe to the recommender so it is embedded instantly on
 * creation. Fire-and-forget at the call site; the backend embeds synchronously
 * inside POST /recipes.
 */
export async function createRecommenderRecipe(meal: Meal): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecipeCreate", "/api/recommender/recipe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: meal.id,
      name: meal.name,
      meal_type: meal.type,
      meal_slots: meal.mealSlots,
      price_pence: Math.round(meal.price * 100),
      prep_minutes: meal.time,
      dietary_tags: [],
      allergens: meal.allergens,
      suitability_tags: meal.tags,
      ingredients: meal.ingredients,
      instructions: meal.instructions,
      nutrition: {
        calories: meal.nutrition.calories,
        protein: meal.nutrition.protein,
        carbs: meal.nutrition.carbs,
        fat: meal.nutrition.fat,
      },
      source: meal.source,
      note: meal.note,
    }),
  });

  await readJson(response, "Recommender recipe create");
}

function toPrototypeMeal(recipe: RecommenderRecipe): Meal | null {
  const seedMeal = seedMeals.find((meal) => meal.id === recipe.id);

  if (!seedMeal) {
    return null;
  }

  return {
    ...seedMeal,
    name: recipe.name,
    type: recipe.meal_type === "fallback" ? "fallback" : recipe.meal_type === "remix" ? "remix" : "cook",
    mealSlots: recipe.meal_slots.filter((slot): slot is Meal["mealSlots"][number] =>
      slot === "breakfast" || slot === "lunch" || slot === "dinner"
    ),
    time: recipe.prep_minutes,
    price: recipe.price_pence / 100,
    tags: [...new Set([...recipe.dietary_tags, ...recipe.suitability_tags])],
    allergens: recipe.allergens,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    nutrition: recipe.nutrition ?? seedMeal.nutrition,
    source: recipe.source ?? seedMeal.source,
    note: recipe.note ?? seedMeal.note,
  };
}

export async function fetchRecommenderRecommendations(input: {
  sessionId: string;
  prefs: Preferences;
  deadlines: Deadline[];
  excludeIds: string[];
}): Promise<Meal[]> {
  await syncRecommenderUser(input.sessionId, input.prefs);

  const response = await fetch(functionUrl("deadlineFoodRecommendations", "/api/recommender/recommendations"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.sessionId,
      n: 100,
      deadline_stress: deadlineStressFromDeadlines(input.deadlines),
      exclude_ids: input.excludeIds,
    }),
  });
  const recipes = await readJson<ScoredRecipe[]>(response, "Recommendations");

  return recipes
    .map(({ recipe }) => toPrototypeMeal(recipe))
    .filter((meal): meal is Meal => meal !== null);
}

export async function recordRecommenderInteraction(input: {
  sessionId: string;
  recipeId: string;
  action: RecommenderInteractionAction;
  deadlines: Deadline[];
  /** User-created recipes are embedded on creation, so their interactions are valid too. */
  isUserCreated?: boolean;
}): Promise<void> {
  // Only recipes that exist in the recommender (seeds + embedded custom recipes)
  // can be referenced by an interaction; the recipe_id column has a FK.
  if (!seedMealIds.has(input.recipeId) && !input.isUserCreated) {
    return;
  }

  const response = await fetch(functionUrl("deadlineFoodInteraction", "/api/recommender/interaction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.sessionId,
      recipe_id: input.recipeId,
      action: input.action,
      context: {
        deadline_stress: deadlineStressFromDeadlines(input.deadlines),
      },
    }),
  });

  await readJson(response, "Recommender interaction");
}
