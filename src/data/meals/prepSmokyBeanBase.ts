import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const prepSmokyBeanBase: MealOption = {
  id: "prep-smoky-bean-base",
  name: "Smoky Bean Tray Bake Base",
  mealType: "prep_base",
  mealSlots: ["dinner"],
  pricePence: 540,
  prepMinutes: 20,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["batch prep", "contains vegetables", "budget steady"],
  recipe: {
    summary: "A tray of beans, peppers and tomatoes that becomes wraps, bowls or jacket potato topping later.",
    ingredients: recipeIngredients(["mixed beans", "chopped tomatoes", "frozen peppers", "rice", "smoked paprika", "tortilla wraps"]),
    steps: ["Bake the bean mix until thick.", "Cook rice while the tray is in the oven.", "Cool and portion the base for later meals."],
    prepNotes: "Use the same base for two or three remixes so the week has fewer decisions.",
    storage: "Keep refrigerated in sealed portions for up to three days.",
    whyItFits: "One short prep block creates cheap meals that can be reheated or wrapped quickly.",
  },
};
