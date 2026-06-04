// Food glyph vocabulary for procedural cooking-step animations.
//
// Maps the food an instruction step acts on to a small emoji glyph, so a step
// like "Chop the onions" can show a knife chopping an 🧅 rather than a bare knife.
// Emoji keep us consistent with the existing `image: "🥗"` recipe convention and
// avoid authoring an SVG per ingredient. Matching is deterministic and explainable.

export type FoodGlyphKey =
  | "onion"
  | "garlic"
  | "tomato"
  | "pepper"
  | "courgette"
  | "carrot"
  | "broccoli"
  | "potato"
  | "mushroom"
  | "spinach"
  | "veg"
  | "beans"
  | "rice"
  | "noodles"
  | "couscous"
  | "oats"
  | "bread"
  | "egg"
  | "tofu"
  | "chicken"
  | "fish"
  | "cheese"
  | "berries"
  | "fruit"
  | "food";

export const GENERIC_FOOD_KEY: FoodGlyphKey = "food";

export const FOOD_GLYPHS: Record<FoodGlyphKey, { glyph: string; label: string }> = {
  onion: { glyph: "🧅", label: "onion" },
  garlic: { glyph: "🧄", label: "garlic" },
  tomato: { glyph: "🍅", label: "tomato" },
  pepper: { glyph: "🫑", label: "pepper" },
  courgette: { glyph: "🥒", label: "courgette" },
  carrot: { glyph: "🥕", label: "carrot" },
  broccoli: { glyph: "🥦", label: "broccoli" },
  potato: { glyph: "🥔", label: "potato" },
  mushroom: { glyph: "🍄", label: "mushroom" },
  spinach: { glyph: "🥬", label: "spinach" },
  veg: { glyph: "🥗", label: "vegetables" },
  beans: { glyph: "🫘", label: "beans" },
  rice: { glyph: "🍚", label: "rice" },
  noodles: { glyph: "🍜", label: "noodles" },
  couscous: { glyph: "🌾", label: "couscous" },
  oats: { glyph: "🥣", label: "oats" },
  bread: { glyph: "🫓", label: "bread" },
  egg: { glyph: "🥚", label: "egg" },
  tofu: { glyph: "🧈", label: "tofu" },
  chicken: { glyph: "🍗", label: "chicken" },
  fish: { glyph: "🐟", label: "fish" },
  cheese: { glyph: "🧀", label: "cheese" },
  berries: { glyph: "🫐", label: "berries" },
  fruit: { glyph: "🍓", label: "fruit" },
  food: { glyph: "🍲", label: "food" },
};

// Ingredient/step words that name a food but should not be treated as the visual
// "object" of a step (they are seasoning/liquids that don't read well as a glyph).
export const FILLER_FOODS = new Set<string>([
  "oil",
  "olive oil",
  "water",
  "salt",
  "pepper",
  "seasoning",
  "spice",
  "spices",
  "stock",
  "sauce",
  "soy sauce",
  "dressing",
  "milk",
  "oat milk",
]);

// Keyword → glyph table, scanned in order. Each entry's `words` are matched as
// whole words against lowercased text. More specific terms come before generic
// ones (e.g. "chickpea" before "pea") so the better glyph wins.
export const FOOD_KEYWORDS: { key: FoodGlyphKey; words: string[] }[] = [
  { key: "garlic", words: ["garlic"] },
  { key: "onion", words: ["onion", "onions", "spring onion", "red onion"] },
  { key: "tomato", words: ["tomato", "tomatoes", "passata"] },
  { key: "pepper", words: ["pepper", "peppers", "bell pepper", "capsicum"] },
  { key: "courgette", words: ["courgette", "courgettes", "zucchini"] },
  { key: "carrot", words: ["carrot", "carrots"] },
  { key: "broccoli", words: ["broccoli"] },
  { key: "mushroom", words: ["mushroom", "mushrooms"] },
  { key: "spinach", words: ["spinach", "kale", "rocket", "salad", "greens"] },
  { key: "potato", words: ["potato", "potatoes", "jacket"] },
  { key: "beans", words: ["chickpea", "chickpeas", "beans", "bean", "lentil", "lentils", "dhal", "dal", "hummus"] },
  { key: "noodles", words: ["noodle", "noodles", "pasta", "spaghetti"] },
  { key: "rice", words: ["rice"] },
  { key: "couscous", words: ["couscous"] },
  { key: "oats", words: ["oats", "oat", "porridge", "chia"] },
  { key: "bread", words: ["bread", "toast", "wrap", "tortilla", "roll", "bun", "pitta"] },
  { key: "egg", words: ["egg", "eggs"] },
  { key: "tofu", words: ["tofu"] },
  { key: "chicken", words: ["chicken"] },
  { key: "fish", words: ["fish", "tuna", "salmon"] },
  { key: "cheese", words: ["cheese", "feta", "halloumi"] },
  { key: "berries", words: ["berries", "berry", "blueberries", "raspberries"] },
  { key: "fruit", words: ["fruit", "banana", "apple", "berry"] },
  { key: "veg", words: ["vegetable", "vegetables", "veg", "veggies"] },
];

const wordRegexCache = new Map<string, RegExp>();

function wordRegex(word: string): RegExp {
  let re = wordRegexCache.get(word);
  if (!re) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`\\b${escaped}`, "i");
    wordRegexCache.set(word, re);
  }
  return re;
}

/** Index of the first whole-word occurrence of `word` in `text`, or -1. */
export function indexOfWord(text: string, word: string): number {
  const match = wordRegex(word).exec(text);
  return match ? match.index : -1;
}

/**
 * Find the earliest food keyword mentioned in `text`.
 * Returns the glyph key, its default label, and the match position.
 */
export function matchFoodInText(
  text: string,
): { key: FoodGlyphKey; label: string; index: number } | null {
  let best: { key: FoodGlyphKey; label: string; index: number } | null = null;
  for (const { key, words } of FOOD_KEYWORDS) {
    for (const word of words) {
      const index = indexOfWord(text, word);
      if (index >= 0 && (best === null || index < best.index)) {
        best = { key, label: FOOD_GLYPHS[key].label, index };
      }
    }
  }
  return best;
}

/** Map a single ingredient/food name to a glyph key, or null if unknown. */
export function glyphKeyForName(name: string): FoodGlyphKey | null {
  return matchFoodInText(name)?.key ?? null;
}
