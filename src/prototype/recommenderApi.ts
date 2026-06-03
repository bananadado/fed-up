import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { requestDeadlineContext, type ContextEventInput } from "./calendarImport";
import type { Deadline, Meal, MealSlot, Preferences, RecipeIngredient } from "./types";

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
  photoUrl?: string | null;
};

type ScoredRecipe = {
  recipe: RecommenderRecipe;
  score: number;
  breakdown: Record<string, number>;
};

export type RecommenderInteractionAction = "swipe_left" | "swipe_right";

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

/** Reconstruct a minimal context event from a deadline so the backend pipeline
 * can re-score it. Deadlines without a concrete date can't be placed. */
function deadlineToContextEvent(deadline: Deadline): ContextEventInput | null {
  if (!deadline.rawDate) return null;
  const hasClockTime = /^\d{2}:\d{2}$/.test(deadline.time);
  return {
    title: deadline.title,
    start: hasClockTime ? `${deadline.rawDate}T${deadline.time}:00` : deadline.rawDate,
    all_day: !hasClockTime,
  };
}

/**
 * Resolve today's cooking-pressure score for the recommender. Prefers the
 * backend #65 per-day stress (which also weighs calendar density, meetings and
 * late events), falling back to the local urgency heuristic when the deadline
 * context endpoint is unavailable or no dated deadlines exist.
 */
export async function resolveDeadlineStress(deadlines: Deadline[]): Promise<number> {
  const events = deadlines
    .map(deadlineToContextEvent)
    .filter((event): event is ContextEventInput => event !== null);

  if (events.length === 0) {
    return deadlineStressFromDeadlines(deadlines);
  }

  try {
    const context = await requestDeadlineContext(events);
    const today = context.days[0];
    return typeof today?.stress === "number" ? today.stress : deadlineStressFromDeadlines(deadlines);
  } catch (error) {
    console.warn("Deadline context unavailable; using local stress heuristic.", error);
    return deadlineStressFromDeadlines(deadlines);
  }
}

export async function syncRecommenderUser(sessionId: string, prefs: Preferences, signal?: AbortSignal): Promise<void> {
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
    signal,
  });

  await readJson(response, "Recommender user sync");
}

/**
 * Persist a user-created recipe on creation. The canonical recipe content is
 * written to Firestore (issue #123) and the recommender embeds it keyed by the
 * recipe UID — both handled by the deadlineFoodRecipeCreate function, which
 * receives the canonical Meal and maps it to the recommender payload itself.
 * Fire-and-forget at the call site.
 */
export async function createRecommenderRecipe(meal: Meal): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecipeCreate", "/api/recommender/recipe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meal),
  });

  await readJson(response, "Recommender recipe create");
}

export async function deleteRecommenderRecipe(recipeId: string): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecipeDelete", "/api/recommender/recipe/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId }),
  });

  await readJson(response, "Recommender recipe delete");
}

export function toPrototypeMeal(recipe: RecommenderRecipe): Meal {
  return {
    id: recipe.id,
    name: recipe.name,
    type: recipe.meal_type === "fallback" ? "fallback" : recipe.meal_type === "remix" ? "remix" : "cook",
    mealSlots: recipe.meal_slots.filter((slot): slot is MealSlot =>
      slot === "breakfast" || slot === "lunch" || slot === "dinner"
    ),
    time: recipe.prep_minutes,
    price: recipe.price_pence / 100,
    tags: [...new Set([...recipe.dietary_tags, ...recipe.suitability_tags])],
    allergens: recipe.allergens,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    nutrition: recipe.nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
    rating: 0,
    reviews: [],
    source: recipe.source ?? "Recommender",
    note: recipe.note ?? "",
    image: "🍽️",
    ...(recipe.photoUrl ? { photoUrl: recipe.photoUrl } : {}),
  };
}

export async function fetchRecommenderRecommendations(input: {
  sessionId: string;
  prefs: Preferences;
  deadlines: Deadline[];
  excludeIds: string[];
  count?: number;
  signal?: AbortSignal;
}): Promise<Meal[]> {
  await syncRecommenderUser(input.sessionId, input.prefs, input.signal);

  const deadlineStress = await resolveDeadlineStress(input.deadlines);

  const response = await fetch(functionUrl("deadlineFoodRecommendations", "/api/recommender/recommendations"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.sessionId,
      n: input.count ?? 100,
      deadline_stress: deadlineStress,
      exclude_ids: input.excludeIds,
    }),
    signal: input.signal,
  });
  const recipes = await readJson<ScoredRecipe[]>(response, "Recommendations");

  return recipes.map(({ recipe }) => toPrototypeMeal(recipe));
}

export async function recordRecommenderInteraction(input: {
  sessionId: string;
  recipeId: string;
  action: RecommenderInteractionAction;
  deadlines: Deadline[];
}): Promise<void> {
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
