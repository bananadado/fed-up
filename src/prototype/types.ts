export type MealType = "cook" | "remix" | "fallback";

export type Meal = {
  id: string;
  name: string;
  type: MealType;
  time: number;
  price: number;
  tags: string[];
  ingredients: string[];
  source: string;
  note: string;
  image: string;
};

export type PlanEntry = {
  day: string;
  context: string;
  mealId: string;
  rescued?: boolean;
};

export type Deadline = {
  id: string;
  title: string;
  date: string;
  time: string;
  intensity: string;
};

export type Preferences = {
  maxTime: number;
  budget: number;
  kitchen: string;
  location: string;
  dietary: string[];
  allergens: string[];
  dislikes: string[];
};

export type Screen = "landing" | "onboarding" | "dashboard" | "calendar" | "plan" | "discover" | "recipes" | "settings";
