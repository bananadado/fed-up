import type { Deadline, Meal, PlanEntry, Preferences } from "./types";

export const days = ["Mon 1 Jun", "Tue 2 Jun", "Wed 3 Jun", "Thu 4 Jun", "Fri 5 Jun"];

export const defaultDeadlines: Deadline[] = [
  { id: "d1", title: "Algorithms coursework", date: "Wed 3 Jun", time: "16:00", intensity: "High" },
  { id: "d2", title: "Design review", date: "Thu 4 Jun", time: "10:00", intensity: "Medium" },
  { id: "d3", title: "Databases quiz", date: "Fri 5 Jun", time: "09:00", intensity: "High" },
];

export const seedMeals: Meal[] = [
  {
    id: "m1",
    name: "Roast veg & chickpea traybake",
    type: "cook",
    time: 20,
    price: 2.85,
    tags: ["vegetarian", "vegan", "batch-friendly"],
    ingredients: ["chickpeas", "peppers", "courgette", "couscous"],
    source: "Budget Bytes",
    note: "Makes two remix portions",
    image: "🥗",
  },
  {
    id: "m2",
    name: "Traybake hummus wrap",
    type: "remix",
    time: 4,
    price: 1.95,
    tags: ["vegetarian", "vegan", "quick"],
    ingredients: ["chickpeas", "wrap", "hummus", "salad"],
    source: "From your prep",
    note: "Uses Monday's traybake",
    image: "🌯",
  },
  {
    id: "m3",
    name: "Ginger tofu noodles",
    type: "cook",
    time: 14,
    price: 3.2,
    tags: ["vegetarian", "vegan", "high protein"],
    ingredients: ["tofu", "noodles", "soy", "broccoli"],
    source: "BBC Good Food",
    note: "One pan",
    image: "🍜",
  },
  {
    id: "m4",
    name: "Lentil pesto pasta pot",
    type: "cook",
    time: 12,
    price: 2.65,
    tags: ["vegetarian", "high protein"],
    ingredients: ["lentils", "pasta", "pesto", "spinach"],
    source: "Student Eats",
    note: "Good before an evening study session",
    image: "🍝",
  },
  {
    id: "m5",
    name: "Bean & salad wrap",
    type: "fallback",
    time: 2,
    price: 4.1,
    tags: ["vegetarian", "vegan", "near library", "no cooking"],
    ingredients: ["beans", "salad", "wrap"],
    source: "Library Cafe",
    note: "2 min collection - illustrative price",
    image: "🥙",
  },
  {
    id: "m6",
    name: "Falafel grain bowl",
    type: "fallback",
    time: 4,
    price: 4.55,
    tags: ["vegetarian", "vegan", "near campus", "no cooking"],
    ingredients: ["falafel", "grains", "salad"],
    source: "Campus Food Hall",
    note: "4 min walk - illustrative price",
    image: "🥣",
  },
  {
    id: "m7",
    name: "Chicken rice bowl",
    type: "fallback",
    time: 4,
    price: 4.7,
    tags: ["high protein", "near campus", "no cooking"],
    ingredients: ["chicken", "rice", "vegetables"],
    source: "Campus Food Hall",
    note: "4 min walk - illustrative price",
    image: "🍛",
  },
  {
    id: "m8",
    name: "Microwave lentil dhal & rice",
    type: "fallback",
    time: 3,
    price: 3.25,
    tags: ["vegetarian", "vegan", "near halls", "no cooking"],
    ingredients: ["lentils", "rice"],
    source: "Local supermarket",
    note: "3 min heat-up - illustrative price",
    image: "🍲",
  },
];

export const initialPlan: PlanEntry[] = [
  { day: days[0] ?? "Mon 1 Jun", context: "Prep window before deadline week", mealId: "m1" },
  { day: days[1] ?? "Tue 2 Jun", context: "Low pressure day", mealId: "m2" },
  { day: days[2] ?? "Wed 3 Jun", context: "Late library - Algorithms due", mealId: "m5" },
  { day: days[3] ?? "Thu 4 Jun", context: "Design review morning", mealId: "m3" },
  { day: days[4] ?? "Fri 5 Jun", context: "Quiz morning - late campus", mealId: "m6" },
];

export const sourceOptions = [
  { id: "budget", name: "Budget Bytes", desc: "Low-cost recipes" },
  { id: "bbc", name: "BBC Good Food", desc: "Reliable quick meals" },
  { id: "student", name: "Student Eats", desc: "Student-focused cooking" },
  { id: "own", name: "My own recipes", desc: "Recipes you add" },
  { id: "campus", name: "Campus fallback options", desc: "Illustrative nearby picks" },
];

export const allergens = ["Peanuts", "Tree nuts", "Milk", "Eggs", "Gluten", "Soy", "Sesame", "Shellfish"];
export const dislikes = ["Mushrooms", "Tofu", "Fish", "Spicy food", "Beans", "Courgette"];
export const dietary = ["Vegetarian", "Vegan", "Halal", "Gluten-free", "Dairy-free"];

export const initialPreferences: Preferences = {
  maxTime: 20,
  budget: 24,
  kitchen: "full",
  location: "library",
  dietary: ["Vegetarian"],
  allergens: [],
  dislikes: [],
};
