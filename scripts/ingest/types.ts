/** Shared types for the ingestion pipeline. */

export type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  preparation?: string;
};

export type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Shape expected by POST /recipes and POST /recipes/bulk on the recommender API. */
export type RecipeIn = {
  id: string;
  name: string;
  meal_type: string;
  meal_slots: string[];
  price_pence: number;
  prep_minutes: number;
  dietary_tags: string[];
  allergens: string[];
  suitability_tags: string[];
  ingredients: Ingredient[];
  instructions: string[];
  cuisine?: string;
  flavor_profile: string[];
  techniques: string[];
  equipment: string[];
  nutrition?: Nutrition;
  source?: string;
  note?: string;
  photoUrl?: string;
};

/** Shape written to Firestore recipes/{id} (frontend Meal model). */
export type FirestoreMeal = {
  id: string;
  name: string;
  type: "cook" | "remix" | "fallback";
  mealSlots: string[];
  time: number;
  price: number;
  tags: string[];
  ingredients: Ingredient[];
  allergens: string[];
  nutrition: Nutrition;
  rating: number;
  reviews: never[];
  instructions: string[];
  source: string;
  note: string;
  image: string;
  photoUrl?: string;
};
