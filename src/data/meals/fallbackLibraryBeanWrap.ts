import type { MealOption } from "@/domain/types";

export const fallbackLibraryBeanWrap: MealOption = {
  id: "fallback-library-bean-wrap",
  name: "Bean & Salad Wrap",
  mealType: "fallback",
  mealSlots: ["lunch", "dinner"],
  pricePence: 410,
  prepMinutes: 2,
  dietaryTags: ["vegetarian", "vegan"],
  suitabilityTags: ["near library", "no cooking", "balanced"],
  provider: "Library Cafe",
  location: "library",
  illustrativeOnly: true,
  recipe: {
    summary: "A prototype cafe wrap with beans, salad and a soft tortilla.",
    ingredients: ["bean filling", "salad leaves", "tortilla wrap", "tomato salsa"],
    steps: ["Collect from the Library Cafe counter.", "Eat cold or ask for it warmed if available."],
    prepNotes: "Prototype option: availability and pricing are illustrative.",
    whyItFits: "It is the fastest compatible fallback near the library.",
  },
};
