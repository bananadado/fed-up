import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import { getDeadlineFoodAuthToken } from "./accountAuth";
import { deadlineToContextEvent, requestDeadlineContext, type ContextEventInput } from "./calendarImport";
import type { Deadline, Meal, MealSlot, Preferences, RecipeIngredient } from "./types";

type RecommenderRecipe = {
  id: string;
  name: string;
  meal_type: string;
  meal_slots: string[];
  price_pence: number;
  prep_minutes: number;
  servings?: number;
  dietary_tags: string[];
  allergens: string[];
  suitability_tags: string[];
  ingredients: RecipeIngredient[];
  instructions: string[];
  nutrition: Meal["nutrition"] | null;
  source: string | null;
  note: string | null;
  photoUrl?: string | null;
  verified?: boolean;
};

type ScoredRecipe = {
  recipe: RecommenderRecipe;
  score: number;
  breakdown: Record<string, number>;
};

export type RecommenderInteractionAction = "swipe_left" | "swipe_right";

export type RecommenderRecommendationMetrics = {
  totalMs: number;
  userSyncMs: number;
  deadlineContextMs: number;
  recommendationNetworkMs: number;
  serverTotalMs?: number;
  serverUpstreamMs?: number;
  serverHydrationMs?: number;
  recipeCount: number;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function numericHeader(response: Response, name: string): number | undefined {
  if (!response.headers) return undefined;
  const value = response.headers.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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

// Canonical (singular) keys used for recommender matching. Display layers
// pluralize where appropriate (see ALLERGEN_DISPLAY in AllergenTag) — keep
// matching on the canonical form so "Peanuts" still filters a "peanut" recipe.
const recommenderTagAliases: Record<string, string> = {
  peanuts: "peanut",
  eggs: "egg",
};

export function normalizeRecommenderTag(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return recommenderTagAliases[normalized] ?? normalized;
}

export function normalizeRecommenderTags(values: string[]): string[] {
  return [...new Set(values.map(normalizeRecommenderTag).filter(Boolean))];
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
      dietary_tags: normalizeRecommenderTags(prefs.dietary),
      allergens: normalizeRecommenderTags(prefs.allergens),
      dislikes: normalizeRecommenderTags(prefs.dislikes),
      likes: normalizeRecommenderTags(prefs.likes),
    }),
    signal,
  });

  await readJson(response, "Recommender user sync");
}

// Publishing, unpublishing and deleting a recipe carry the caller's Firebase ID
// token (#213 follow-up). The backend accepts anonymous Firebase tokens and
// enforces ownership by UID.
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getDeadlineFoodAuthToken().catch(() => null);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Persist a user-created recipe on publish. The canonical recipe content is
 * written to Firestore (issue #123) and the recommender embeds it keyed by the
 * recipe UID — both handled by the deadlineFoodRecipeCreate function, which
 * receives the canonical Meal and maps it to the recommender payload itself.
 * Requires a signed-in account.
 */
export async function createRecommenderRecipe(meal: Meal): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecipeCreate", "/api/recommender/recipe"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(meal),
  });

  await readJson(response, "Recommender recipe create");
}

/** Soft-unpublish: keep the recipe + reviews but remove it from Discover and
 * share links. Owner-only; requires a signed-in account. */
export async function unpublishRecommenderRecipe(recipeId: string): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecipeUnpublish", "/api/recommender/recipe/unpublish"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ recipeId }),
  });

  await readJson(response, "Recommender recipe unpublish");
}

export async function deleteRecommenderRecipe(recipeId: string): Promise<void> {
  const response = await fetch(functionUrl("deadlineFoodRecipeDelete", "/api/recommender/recipe/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ recipeId }),
  });

  await readJson(response, "Recommender recipe delete");
}

export function toMeal(recipe: RecommenderRecipe): Meal {
  return {
    id: recipe.id,
    name: recipe.name,
    type: recipe.meal_type === "fallback" ? "fallback" : recipe.meal_type === "remix" ? "remix" : "cook",
    mealSlots: recipe.meal_slots.filter((slot): slot is MealSlot =>
      slot === "breakfast" || slot === "lunch" || slot === "dinner"
    ),
    time: recipe.prep_minutes,
    price: recipe.price_pence / 100,
    ...(typeof recipe.servings === "number" ? { servings: recipe.servings } : {}),
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
    verified: recipe.verified === true,
    ...(recipe.photoUrl ? { photoUrl: recipe.photoUrl } : {}),
  };
}

/**
 * Resolve a recipe from its public share slug (#213). Used when opening a
 * `#/recipe/<shareId>` deep link for a recipe the viewer doesn't already have
 * locally (e.g. a friend's shared community recipe). Returns null on 404.
 */
export async function fetchSharedRecipe(shareId: string): Promise<Meal | null> {
  const url = new URL(functionUrl("deadlineFoodRecipe", "/api/deadline-food/recipe"));
  url.searchParams.set("shareId", shareId);

  const response = await fetch(url.toString());
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Shared recipe request failed with ${response.status}`);
  }

  const recipe = (await response.json()) as Partial<Meal> & { id: string; name: string };
  // The canonical Firestore recipe is already in app `Meal` shape (unlike the
  // recommender's snake_case payload), so normalise only the fields a fresh
  // viewer needs and trust the stored values for the rest.
  return {
    rating: 0,
    reviews: [],
    image: "🍽️",
    ...recipe,
    tags: recipe.tags ?? [],
    allergens: recipe.allergens ?? [],
    ingredients: recipe.ingredients ?? [],
    instructions: recipe.instructions ?? [],
    mealSlots: recipe.mealSlots ?? [],
    nutrition: recipe.nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
  } as Meal;
}

export type RecipeState = "published" | "unpublished" | "deleted";

/**
 * Report the current publish state of recipes the viewer already references
 * (saved or planned community recipes), so the UI can tell "unpublished" (still
 * usable, tagged) from "deleted" (gone — pick an alternative). Status only; the
 * caller already holds the content. Returns {} on failure (treat as published).
 */
export async function fetchRecipeStates(ids: string[]): Promise<Record<string, RecipeState>> {
  if (ids.length === 0) return {};

  const response = await fetch(functionUrl("deadlineFoodRecipeStates", "/api/deadline-food/recipe-states"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  const { states } = await readJson<{ states: Record<string, RecipeState> }>(response, "Recipe states");
  return states ?? {};
}

export async function fetchRecommenderRecommendations(input: {
  sessionId: string;
  prefs: Preferences;
  deadlines: Deadline[];
  excludeIds: string[];
  count?: number;
  mealSlot?: string;
  signal?: AbortSignal;
  onMetrics?: (metrics: RecommenderRecommendationMetrics) => void;
}): Promise<Meal[]> {
  const startedAt = nowMs();

  const userSyncStartedAt = nowMs();
  const userSyncPromise = syncRecommenderUser(input.sessionId, input.prefs, input.signal)
    .then(() => nowMs() - userSyncStartedAt);

  const deadlineContextStartedAt = nowMs();
  const deadlineStressPromise = resolveDeadlineStress(input.deadlines)
    .then((deadlineStress) => ({
      deadlineStress,
      deadlineContextMs: nowMs() - deadlineContextStartedAt,
    }));

  const [{ deadlineStress, deadlineContextMs }, userSyncMs] = await Promise.all([
    deadlineStressPromise,
    userSyncPromise,
  ]);

  const recommendationStartedAt = nowMs();
  const response = await fetch(functionUrl("deadlineFoodRecommendations", "/api/recommender/recommendations"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.sessionId,
      n: input.count ?? 100,
      deadline_stress: deadlineStress,
      exclude_ids: input.excludeIds,
      meal_slot: input.mealSlot ?? null,
    }),
    signal: input.signal,
  });
  const recipes = await readJson<ScoredRecipe[]>(response, "Recommendations");
  const recommendationNetworkMs = nowMs() - recommendationStartedAt;
  input.onMetrics?.({
    totalMs: nowMs() - startedAt,
    userSyncMs,
    deadlineContextMs,
    recommendationNetworkMs,
    serverTotalMs: numericHeader(response, "x-deadline-food-total-ms"),
    serverUpstreamMs: numericHeader(response, "x-deadline-food-recommender-ms"),
    serverHydrationMs: numericHeader(response, "x-deadline-food-hydration-ms"),
    recipeCount: recipes.length,
  });

  return recipes.map(({ recipe }) => toMeal(recipe));
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
