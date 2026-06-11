export type MealType = "cook" | "remix" | "fallback";
export type MealSlot = "breakfast" | "lunch" | "dinner";

import type { RecipeIngredient } from "@/domain/types";

export type { RecipeIngredient };

export type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source?: NutritionSource;
};

export type NutritionSource = {
  provider: "manual" | "USDA" | "OpenFoodFacts" | "USDA + OpenFoodFacts";
  label: string;
  fetchedAt?: string;
  matchedIngredients?: NutritionMatch[];
  missingIngredients?: string[];
};

export type NutritionMatch = {
  ingredient: string;
  productName: string;
  grams: number;
};

export type RecipeReview = {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
};

export type Meal = {
  id: string;
  name: string;
  type: MealType;
  mealSlots: MealSlot[];
  time: number;
  price: number;
  servings?: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  allergens: string[];
  nutrition: Nutrition;
  rating: number;
  reviews: RecipeReview[];
  instructions: string[];
  source: string;
  note: string;
  image: string;
  photoUrl?: string;
  isUserCreated?: boolean;
  published?: boolean;
  /** Firebase uid of the account that owns a published recipe (#213 follow-up). */
  ownerUid?: string;
  /** Curated/seed content. User-contributed recipes are never verified (#213). */
  verified?: boolean;
  /** Public, URL-safe share slug (hash of `id`); set for recipes in Firestore. */
  shareId?: string;
};

export type PlanMeal = {
  slot: MealSlot;
  mealId: string;
  rescued?: boolean;
  /** True when this slot is a batch cook that seeds leftovers on later days. */
  batchCook?: boolean;
  /** Set when this slot reuses an earlier batch cook (mealId of the source cook). */
  leftoverOf?: string;
};

export type PlanEntry = {
  /** Display label, e.g. "Mon 1 Jun". */
  day: string;
  /** Local ISO date `YYYY-MM-DD` the entry maps to (auto-planning, calendar export, staleness). */
  dateIso?: string;
  context: string;
  meals: PlanMeal[];
};

export type Deadline = {
  id: string;
  title: string;
  date: string;
  time: string;
  intensity: string;
  eventType: "academic" | "general";
  effortHours: number;
  urgency: "low" | "medium" | "high";
  confirmed?: boolean;
  rawDate?: string;
};

export type PlanRegenMode = "prompt" | "auto";

export type Preferences = {
  maxTime: number | null;
  budget: number;
  kitchen: string;
  cookingAbility: string;
  postcode: string;
  university: string;
  dietary: string[];
  allergens: string[];
  dislikes: string[];
  likes: string[];
  availableIngredients: RecipeIngredient[];
  /** How many days ahead the auto-planner fills (default 21 = 3 weeks). */
  planningHorizonDays: number;
  /** Whether stale plans prompt the user ("prompt") or regenerate silently ("auto"). */
  planRegenMode: PlanRegenMode;
  unitSystem: "metric" | "imperial";
  /** Time of day (HH:MM) to schedule evening prep reminders, e.g. "22:00". */
  prepReminderTime: string;
};

export type DiscoverRecommendationStatus = "idle" | "loading" | "ready" | "exhausted";
export type DiscoverRecommendationTrigger = "route_entry" | "tab_entry" | "screen_mount" | "refill";

export type DiscoverRecommendationState = {
  contextKey: string;
  recipes: Meal[];
  status: DiscoverRecommendationStatus;
  requestStartedAt?: number;
  requestTrigger?: DiscoverRecommendationTrigger;
};

export type Screen = "landing" | "onboarding" | "privacy-policy" | "dashboard" | "calendar" | "plan" | "recipes" | "settings" | "recipe-detail";

export type CalendarProvider = "google" | "outlook" | "apple" | "other";

export type { CalendarEvent } from "./calendarImport/types";
