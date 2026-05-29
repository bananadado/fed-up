import { recipeIngredients } from "@/domain/ingredients";
import type { MealOption } from "@/domain/types";

export const remixBeanWrap: MealOption = {
  id: "remix-bean-wrap",
  name: "Smoky Bean Wrap",
  mealType: "remix",
  mealSlots: ["lunch", "dinner"],
  pricePence: 340,
  prepMinutes: 4,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["portable", "low effort", "no pan needed"],
  derivesFromPrepBaseId: "prep-smoky-bean-base",
  recipe: {
    summary: "A portable wrap using the bean base, salad and a tortilla.",
    ingredients: recipeIngredients(["smoky bean base", "tortilla wrap", "lettuce", "sweetcorn", "hot sauce"]),
    steps: ["Warm the wrap briefly.", "Spoon in bean base and salad.", "Fold tightly and wrap in foil if carrying."],
    prepNotes: "Use less filling than a bowl so the wrap closes cleanly.",
    storage: "Best made the same day so the wrap stays firm.",
    whyItFits: "It works as a library lunch because it is quick, cheap and portable.",
  },
};
