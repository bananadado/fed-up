export type MealType = "cook" | "remix" | "fallback";
export type MealSlot = "breakfast" | "lunch" | "dinner";

export type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
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
  ingredients: string[];
  allergens: string[];
  nutrition: Nutrition;
  rating: number;
  reviews: RecipeReview[];
  instructions: string[];
  source: string;
  note: string;
  image: string;
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
};

export type Preferences = {
  maxTime: number | null;
  budget: number;
  kitchen: string;
  postcode: string;
  university: string;
  dietary: string[];
  allergens: string[];
  dislikes: string[];
  likes: string[];
};

export type Screen = "landing" | "onboarding" | "dashboard" | "calendar" | "plan" | "discover" | "recipes" | "settings" | "recipe-detail";
