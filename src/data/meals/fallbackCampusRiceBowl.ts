import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const fallbackCampusRiceBowl: MealOption = {
  id: "fallback-campus-rice-bowl",
  name: "Chicken Rice Bowl",
  mealType: "fallback",
  mealSlots: ["lunch", "dinner"],
  pricePence: 470,
  prepMinutes: 4,
  dietaryTags: ["halal"],
  suitabilityTags: ["campus", "no cooking", "high-protein"],
  provider: "Campus Food Hall",
  location: "campus",
  illustrativeOnly: true,
  recipe: {
    summary: "A app campus bowl with chicken, rice and vegetables.",
    ingredients: recipeIngredients(["halal chicken", "rice", "mixed vegetables", "yoghurt dressing"]),
    steps: ["Collect from Campus Food Hall.", "Choose the lighter dressing option if offered."],
    prepNotes: "App option: availability and pricing are illustrative.",
    whyItFits: "It is a practical high-protein fallback when cooking is unrealistic.",
  },
};
