import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const remixChickenRicePot: MealOption = {
  id: "remix-chicken-rice-pot",
  name: "Chicken Rice Pot",
  mealType: "remix",
  mealSlots: ["lunch", "dinner"],
  pricePence: 390,
  prepMinutes: 5,
  dietaryTags: ["halal"],
  suitabilityTags: ["high-protein", "low effort", "reheats quickly"],
  derivesFromPrepBaseId: "prep-chicken-rice-base",
  recipe: {
    summary: "A microwaveable chicken rice pot from the prepared base.",
    ingredients: recipeIngredients(["lemon chicken rice base", "spinach", "yoghurt dressing", "black pepper"]),
    steps: ["Microwave the chicken rice base until hot.", "Fold through spinach.", "Top with dressing after heating."],
    prepNotes: "Keep dressing separate until serving.",
    storage: "Keep chilled and reheat until steaming.",
    whyItFits: "It gives a hot meal without a full cooking session.",
  },
};
