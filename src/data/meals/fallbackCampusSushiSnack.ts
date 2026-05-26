import type { MealOption } from "@/domain/types";

export const fallbackCampusSushiSnack: MealOption = {
  id: "fallback-campus-sushi-snack",
  name: "Veg Sushi Snack Box",
  mealType: "fallback",
  mealSlots: ["lunch"],
  pricePence: 520,
  prepMinutes: 2,
  dietaryTags: ["vegetarian"],
  suitabilityTags: ["campus", "no cooking", "portable"],
  provider: "Campus Express",
  location: "campus",
  illustrativeOnly: true,
  recipe: {
    summary: "A portable vegetarian sushi-style snack box.",
    ingredients: ["vegetable sushi pieces", "soy sauce", "edamame side"],
    steps: ["Collect from Campus Express.", "Eat cold without preparation."],
    prepNotes: "Prototype option: availability and pricing are illustrative.",
    whyItFits: "It is quick to collect for lunch when queues are short.",
  },
};
