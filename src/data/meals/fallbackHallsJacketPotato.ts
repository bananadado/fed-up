import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const fallbackHallsJacketPotato: MealOption = {
  id: "fallback-halls-jacket-potato",
  name: "Jacket Potato with Beans",
  mealType: "fallback",
  mealSlots: ["lunch", "dinner"],
  pricePence: 390,
  prepMinutes: 5,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["near halls", "filling", "budget steady"],
  provider: "Halls Shop",
  location: "halls",
  illustrativeOnly: true,
  recipe: {
    summary: "A filling potato and beans option near halls.",
    ingredients: recipeIngredients(["jacket potato", "baked beans", "side salad"]),
    steps: ["Collect from the Halls Shop hot counter.", "Add side salad if available."],
    prepNotes: "App option: availability and pricing are illustrative.",
    whyItFits: "It is the cheapest seeded fallback and useful when the budget is tight.",
  },
};
