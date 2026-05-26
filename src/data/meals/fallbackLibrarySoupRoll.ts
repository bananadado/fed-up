import type { MealOption } from "@/domain/types";

export const fallbackLibrarySoupRoll: MealOption = {
  id: "fallback-library-soup-roll",
  name: "Tomato Soup & Wholegrain Roll",
  mealType: "fallback",
  mealSlots: ["lunch", "dinner"],
  pricePence: 430,
  prepMinutes: 3,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["near library", "warm meal", "contains vegetables"],
  provider: "Library Cafe",
  location: "library",
  illustrativeOnly: true,
  recipe: {
    summary: "A warm soup and roll fallback for a late library session.",
    ingredients: ["tomato soup", "wholegrain roll", "pepper sachet"],
    steps: ["Collect the soup and roll.", "Eat while warm between study blocks."],
    prepNotes: "Prototype option: availability and pricing are illustrative.",
    whyItFits: "It is warm, low-effort and still close to the preferred study area.",
  },
};
