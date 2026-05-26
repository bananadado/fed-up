import type { MealOption } from "@/domain/types";

export const fallbackCampusHummusBox: MealOption = {
  id: "fallback-campus-hummus-box",
  name: "Hummus Mezze Box",
  mealType: "fallback",
  mealSlots: ["lunch", "dinner"],
  pricePence: 450,
  prepMinutes: 3,
  dietaryTags: ["vegetarian", "vegan", "halal"],
  suitabilityTags: ["campus", "no cooking", "balanced"],
  provider: "Campus Food Hall",
  location: "campus",
  illustrativeOnly: true,
  recipe: {
    summary: "A chilled mezze-style fallback with hummus, grains and vegetables.",
    ingredients: ["hummus", "grain salad", "carrot sticks", "flatbread"],
    steps: ["Collect the box from Campus Food Hall.", "Eat cold between classes or study blocks."],
    prepNotes: "Prototype option: availability and pricing are illustrative.",
    whyItFits: "It covers several dietary constraints without requiring cooking.",
  },
};
