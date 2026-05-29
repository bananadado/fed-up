import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const quickPeanutNoodles: MealOption = {
  id: "quick-peanut-noodles",
  name: "Peanut Noodles with Greens",
  mealType: "quick_cook",
  mealSlots: ["dinner"],
  pricePence: 420,
  prepMinutes: 9,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["quick cook", "contains vegetables", "one pan"],
  recipe: {
    summary: "Noodles tossed with peanut sauce and frozen greens in one pan.",
    ingredients: recipeIngredients(["noodles", "peanut butter", "soy sauce", "frozen greens", "lime or vinegar"]),
    steps: ["Boil noodles and greens together.", "Stir peanut butter with soy sauce and a splash of water.", "Toss everything together."],
    prepNotes: "Use frozen vegetables so there is no chopping.",
    whyItFits: "It is a proper hot dinner with minimal washing up.",
  },
};
