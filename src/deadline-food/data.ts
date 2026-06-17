import type { CalendarProvider, MealSlot, PlanEntry, Preferences } from "./types";
export const calendarProviders: { id: CalendarProvider; name: string; hint: string; recommended: boolean }[] = [
  { id: "google", name: "Google Calendar", hint: "Sign in or paste a subscription link", recommended: true },
  { id: "outlook", name: "Outlook Calendar", hint: "Sign in or paste a subscription link", recommended: false },
  { id: "apple", name: "Apple Calendar", hint: "Paste your iCloud subscription link", recommended: false },
  { id: "other", name: "Other calendar", hint: "Any app that publishes an .ics link", recommended: false },
];

export const mealSlots: MealSlot[] = ["breakfast", "lunch", "dinner"];

export const initialPlan: PlanEntry[] = [];

export const sourceOptions = [
  { id: "budget", name: "Keep costs low", desc: "Prefer low-cost recipes and cheaper swaps" },
  { id: "bbc", name: "Reliable familiar meals", desc: "Prefer straightforward recipes from trusted sources" },
  { id: "student", name: "Student-focused cooking", desc: "Prefer minimal equipment and realistic prep" },
  { id: "own", name: "Use my own recipes", desc: "Include recipes you add yourself" },
  { id: "campus", name: "Allow campus fallbacks", desc: "Use nearby ready options when cooking is not realistic" },
];

export const allergens = ["Peanuts", "Tree nuts", "Milk", "Eggs", "Gluten", "Soy", "Sesame", "Shellfish"];
export const dislikes = ["Mushrooms", "Tofu", "Fish", "Spicy food", "Beans", "Courgette"];
export const likes = ["Pasta", "Rice and curry", "Stir fry", "Sandwiches", "Instant noodles", "Soup", "Omelettes", "Wraps", "Toast / cereal", "Salads", "Roasted meals", "High-protein meals"];
export const dietary = ["Vegetarian", "Vegan", "Halal", "Gluten-free", "Dairy-free"];
export const cookingAbilities = [
  { id: "beginner", name: "Beginner", description: "Toast, sandwiches, microwave meals, boiling pasta" },
  { id: "basic", name: "Basic", description: "Simple one-pot meals, stir-fries, eggs" },
  { id: "intermediate", name: "Intermediate", description: "Follow most recipes, meal prep" },
  { id: "advanced", name: "Advanced", description: "Comfortable adapting recipes and techniques" },
];

export const initialPreferences: Preferences = {
  maxTime: 180,
  budget: 48,
  kitchen: "",
  cookingAbility: "",
  dietary: [],
  allergens: [],
  dislikes: [],
  likes: [],
  availableIngredients: [],
  planningHorizonDays: 21,
  planRegenMode: "prompt",
  unitSystem: "metric" as const,
  prepReminderTime: "22:00",
};
