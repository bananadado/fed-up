import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const remixBeanRiceBowl: MealOption = {
  id: "remix-bean-rice-bowl",
  name: "Bean Rice Bowl with Crunchy Salad",
  mealType: "remix",
  mealSlots: ["lunch", "dinner"],
  pricePence: 360,
  prepMinutes: 5,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["low effort", "contains vegetables", "balanced"],
  derivesFromPrepBaseId: "prep-smoky-bean-base",
  recipe: {
    summary: "A reheated bean base served over rice with a quick crunchy salad.",
    ingredients: recipeIngredients(["smoky bean base", "rice portion", "lettuce", "cucumber", "lime or vinegar"]),
    steps: ["Reheat the bean base.", "Warm or microwave the rice.", "Add chopped salad and finish with lime."],
    prepNotes: "Pack salad separately if taking it for lunch.",
    storage: "Use a chilled prepared base within three days.",
    whyItFits: "It turns batch prep into a filling meal in about five minutes.",
  },
};
