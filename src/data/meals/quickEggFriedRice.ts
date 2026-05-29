import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const quickEggFriedRice: MealOption = {
  id: "quick-egg-fried-rice",
  name: "Egg Fried Rice with Peas",
  mealType: "quick_cook",
  mealSlots: ["lunch", "dinner"],
  pricePence: 380,
  prepMinutes: 10,
  dietaryTags: ["vegetarian"],
  suitabilityTags: ["quick cook", "budget steady", "filling"],
  recipe: {
    summary: "A fast fried rice using microwave rice, egg and peas.",
    ingredients: recipeIngredients(["microwave rice", "egg", "frozen peas", "soy sauce", "spring onion"]),
    steps: ["Scramble the egg in a pan.", "Add rice and peas.", "Season with soy sauce and heat through."],
    prepNotes: "Microwave rice keeps the total time predictable.",
    whyItFits: "It is cheap and filling when the plan still allows ten minutes.",
  },
};
