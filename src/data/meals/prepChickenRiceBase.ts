import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const prepChickenRiceBase: MealOption = {
  id: "prep-chicken-rice-base",
  name: "Lemon Chicken Rice Base",
  mealType: "prep_base",
  mealSlots: ["dinner"],
  pricePence: 620,
  prepMinutes: 20,
  dietaryTags: ["halal"],
  suitabilityTags: ["batch prep", "high-protein", "reheats quickly"],
  recipe: {
    summary: "A lemon chicken and rice base for quick pots or salad boxes through the week.",
    ingredients: recipeIngredients(["halal chicken pieces", "rice", "lemon juice", "peas", "spinach", "yoghurt dressing"]),
    steps: ["Cook the rice and chicken together.", "Fold through peas and spinach.", "Portion into boxes with dressing separate."],
    prepNotes: "Cook once, then use cold for lunch or hot for dinner.",
    storage: "Keep chilled and reheat until steaming if serving hot.",
    whyItFits: "It gives a high-protein base without requiring fresh cooking every day.",
  },
};
