import type { MealOption } from "@/domain/types";

export const remixChickenSaladBox: MealOption = {
  id: "remix-chicken-salad-box",
  name: "Lemon Chicken Salad Box",
  mealType: "remix",
  mealSlots: ["lunch"],
  pricePence: 410,
  prepMinutes: 6,
  dietaryTags: ["halal"],
  suitabilityTags: ["high-protein", "contains vegetables", "portable"],
  derivesFromPrepBaseId: "prep-chicken-rice-base",
  recipe: {
    summary: "A cold lunch box built from the chicken base with salad leaves and dressing.",
    ingredients: ["lemon chicken rice base", "salad leaves", "cucumber", "yoghurt dressing", "flatbread"],
    steps: ["Add salad leaves to a lunch box.", "Top with chilled chicken rice.", "Pack dressing and flatbread separately."],
    prepNotes: "Build in the morning so it is ready before campus.",
    storage: "Keep chilled until lunch.",
    whyItFits: "It avoids queueing for lunch on a deadline day.",
  },
};
