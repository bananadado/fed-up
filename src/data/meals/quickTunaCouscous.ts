import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const quickTunaCouscous: MealOption = {
  id: "quick-tuna-couscous",
  name: "Tuna Couscous Bowl",
  mealType: "quick_cook",
  mealSlots: ["lunch"],
  pricePence: 450,
  prepMinutes: 8,
  dietaryTags: [],
  suitabilityTags: ["quick cook", "high-protein", "minimal washing up"],
  recipe: {
    summary: "Couscous softened with hot water and topped with tuna and vegetables.",
    ingredients: recipeIngredients(["couscous", "tuna", "sweetcorn", "spinach", "lemon juice"]),
    steps: ["Cover couscous with hot water.", "Fluff after five minutes.", "Top with tuna, sweetcorn and spinach."],
    prepNotes: "Useful for lunch when there is kettle access but no hob.",
    whyItFits: "It is high-protein and avoids a full cooking session.",
  },
};
