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
};

export type PlanMeal = {
  slot: MealSlot;
  mealId: string;
  rescued?: boolean;
};

export type PlanEntry = {
  day: string;
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
};

export type Screen = "landing" | "onboarding" | "dashboard" | "calendar" | "plan" | "recipes" | "settings" | "recipe-detail";

export type CalendarProvider = "google" | "outlook" | "apple" | "other";

export type { CalendarEvent } from "./calendarImport/types";
