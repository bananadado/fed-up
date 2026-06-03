/**
 * Shared normalisation utilities: allergens, dietary tags, suitability tags,
 * flavor profiles, techniques, equipment, prep time, nutrition, and
 * instruction splitting.
 *
 * All functions are pure and work from ingredient names + instructions text.
 */

import type { Nutrition } from "./types.ts";

// ── Allergens ─────────────────────────────────────────────────────────────

const ALLERGEN_KEYWORDS: Array<[string, string]> = [
  ["gluten", "wheat|flour|pasta|bread|breadcrumb|noodle|couscous|barley|rye|spelt|oat|tortilla|wrap|pita|soy sauce|udon|ramen|bulgur"],
  ["milk", "milk|butter|cream|cheese|yoghurt|yogurt|cheddar|mozzarella|parmesan|brie|feta|ricotta|ghee|lactose|whey"],
  ["eggs", "egg"],
  ["nuts", "almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|brazil nut|pine nut"],
  ["peanuts", "peanut"],
  ["soy", "soy|tofu|edamame|miso|tempeh"],
  ["fish", "fish|salmon|tuna|cod|haddock|mackerel|sardine|anchov|tilapia|bass|trout|halibut|sole"],
  ["shellfish", "prawn|shrimp|crab|lobster|mussel|scallop|squid|oyster|clam|crayfish"],
  ["sesame", "sesame|tahini"],
  ["celery", "celery|celeriac"],
  ["mustard", "mustard"],
  ["sulphites", "wine|dried fruit|raisin|sultana|currant"],
];

export function detectAllergens(ingredients: string[]): string[] {
  const lc = ingredients.map((i) => i.toLowerCase()).join(" | ");
  const found: string[] = [];

  for (const [allergen, pattern] of ALLERGEN_KEYWORDS) {
    if (new RegExp(pattern).test(lc)) found.push(allergen);
  }

  return found;
}

// ── Dietary tags ───────────────────────────────────────────────────────────

const MEAT_PATTERN =
  /\b(beef|chicken|pork|lamb|bacon|ham|turkey|duck|veal|venison|goat|sausage|salami|chorizo|pepperoni|lard|gelatin)\b/;
const FISH_PATTERN =
  /\b(fish|salmon|tuna|cod|haddock|mackerel|sardine|anchov|prawn|shrimp|crab|lobster|mussel|scallop|squid|oyster|clam|seafood)\b/;
const DAIRY_PATTERN =
  /\b(milk|butter|cream|cheese|yoghurt|yogurt|ghee|whey|lactose)\b/;
const EGG_PATTERN = /\begg\b/;
const GLUTEN_PATTERN =
  /\b(wheat|flour|pasta|bread|breadcrumb|noodle|couscous|barley|rye|spelt|tortilla|wrap|pita|udon|ramen|bulgur)\b/;

export function detectDietaryTags(
  ingredients: string[],
  category: string,
): string[] {
  const lc = ingredients.map((i) => i.toLowerCase()).join(" | ");
  const tags: string[] = [];

  const hasMeat = MEAT_PATTERN.test(lc);
  const hasFish = FISH_PATTERN.test(lc);
  const hasDairy = DAIRY_PATTERN.test(lc);
  const hasEgg = EGG_PATTERN.test(lc);
  const hasGluten = GLUTEN_PATTERN.test(lc);

  // Category-based shortcuts from TheMealDB
  if (category === "Vegan") {
    tags.push("vegan", "vegetarian");
  } else if (category === "Vegetarian") {
    tags.push("vegetarian");
  } else if (!hasMeat && !hasFish) {
    if (!hasDairy && !hasEgg) tags.push("vegan");
    tags.push("vegetarian");
  }

  if (!hasGluten) tags.push("gluten-free");
  if (!hasDairy) tags.push("dairy-free");

  return [...new Set(tags)];
}

// ── Suitability tags ───────────────────────────────────────────────────────

const HIGH_PROTEIN_PATTERN =
  /\b(chicken|beef|pork|lamb|turkey|egg|tuna|salmon|lentil|chickpea|tofu|tempeh|edamame|prawn|shrimp)\b/;
const BATCH_PATTERN =
  /\b(leftover|batch|portion|freeze|store|fridge|container|make ahead|prep ahead)\b/;
const ONE_PAN_PATTERN = /\bone[- ]pan|one[- ]pot|single pan|single pot\b/;
const MICROWAVE_PATTERN = /\bmicrowave\b/;

export function detectSuitabilityTags(
  prepMinutes: number,
  ingredients: string[],
  instructions: string,
): string[] {
  const lc = instructions.toLowerCase();
  const ingLc = ingredients.map((i) => i.toLowerCase()).join(" | ");
  const tags: string[] = [];

  if (prepMinutes <= 15) tags.push("quick");
  if (HIGH_PROTEIN_PATTERN.test(ingLc)) tags.push("high protein");
  if (BATCH_PATTERN.test(lc)) tags.push("batch-friendly");
  if (ONE_PAN_PATTERN.test(lc)) tags.push("one pan");
  if (MICROWAVE_PATTERN.test(lc)) tags.push("microwave");

  return tags;
}

// ── Flavor profile ─────────────────────────────────────────────────────────

const CUISINE_FLAVORS: Record<string, string[]> = {
  Italian: ["savory", "herby", "rich"],
  Indian: ["spiced", "aromatic", "warming"],
  Chinese: ["umami", "savory"],
  Japanese: ["umami", "mild", "savory"],
  Thai: ["spicy", "tangy", "herby"],
  Mexican: ["spicy", "savory", "tangy"],
  French: ["rich", "buttery", "savory"],
  Greek: ["fresh", "herby", "tangy"],
  Spanish: ["savory", "smoky", "rich"],
  Moroccan: ["spiced", "sweet", "aromatic"],
  American: ["savory", "smoky", "rich"],
  British: ["savory", "mild"],
  Irish: ["savory", "mild", "warming"],
  Vietnamese: ["fresh", "tangy", "herby"],
  Malaysian: ["spiced", "rich", "aromatic"],
  Turkish: ["spiced", "savory", "aromatic"],
  Egyptian: ["spiced", "earthy", "savory"],
  Jamaican: ["spicy", "smoky", "savory"],
  Canadian: ["savory", "mild"],
  Croatian: ["savory", "herby"],
  Dutch: ["mild", "savory"],
  Kenyan: ["savory", "spiced"],
  Polish: ["savory", "mild"],
  Portuguese: ["savory", "herby"],
  Russian: ["mild", "savory"],
  Tunisian: ["spiced", "tangy"],
  Unknown: ["savory"],
};

export function inferFlavorProfile(area: string): string[] {
  return CUISINE_FLAVORS[area] ?? ["savory"];
}

// ── Techniques ─────────────────────────────────────────────────────────────

const TECHNIQUE_PATTERNS: Array<[string, string]> = [
  ["stir fry", "stir.?fr"],
  ["deep fry", "deep.?fr"],
  ["fry", "\\bfr(y|ied|ying)\\b"],
  ["roast", "\\broast"],
  ["bake", "\\bbak(e|ed|ing)\\b"],
  ["grill", "\\bgrill"],
  ["simmer", "\\bsimmer"],
  ["boil", "\\bboil"],
  ["steam", "\\bsteam"],
  ["sauté", "\\bsaut"],
  ["marinate", "\\bmarinат|\\bmarinат|\\bmarinate"],
  ["blend", "\\bblend"],
  ["chop", "\\bchop"],
  ["slice", "\\bslice"],
  ["dice", "\\bdice"],
  ["mince", "\\bmince"],
];

export function extractTechniques(instructions: string): string[] {
  const lc = instructions.toLowerCase();
  const found: string[] = [];
  for (const [technique, pattern] of TECHNIQUE_PATTERNS) {
    if (new RegExp(pattern).test(lc)) found.push(technique);
  }
  return [...new Set(found)];
}

// ── Equipment ──────────────────────────────────────────────────────────────

const EQUIPMENT_PATTERNS: Array<[string, string]> = [
  ["oven", "\\boven\\b|\\bbake\\b|\\broast\\b"],
  ["wok", "\\bwok\\b"],
  ["pan", "\\b(frying pan|skillet|pan\\b)"],
  ["pot", "\\bpot\\b|\\bsaucepan\\b"],
  ["baking dish", "baking dish|casserole dish|roasting tin"],
  ["blender", "blend|food processor"],
  ["microwave", "microwave"],
  ["grill", "\\bgrill\\b|\\bbarbecue\\b|\\bbbq\\b"],
];

export function extractEquipment(instructions: string): string[] {
  const lc = instructions.toLowerCase();
  const found: string[] = [];
  for (const [item, pattern] of EQUIPMENT_PATTERNS) {
    if (new RegExp(pattern).test(lc)) found.push(item);
  }
  return [...new Set(found)];
}

// ── Prep time ──────────────────────────────────────────────────────────────

const CATEGORY_FALLBACK_MINUTES: Record<string, number> = {
  Breakfast: 15,
  Starter: 20,
  Side: 20,
  Pasta: 25,
  Seafood: 25,
  Vegetarian: 25,
  Vegan: 25,
  Chicken: 35,
  Beef: 45,
  Lamb: 60,
  Pork: 40,
  Goat: 60,
  Miscellaneous: 30,
};

export function estimatePrepMinutes(
  instructions: string,
  category: string,
): number {
  const lc = instructions.toLowerCase();
  let maxMinutes = 0;

  // "X-Y minutes" → take the midpoint
  for (const m of lc.matchAll(/(\d+)\s*[-–]\s*(\d+)\s*(?:minutes?|mins?)/g)) {
    maxMinutes = Math.max(
      maxMinutes,
      (parseInt(m[1]!) + parseInt(m[2]!)) / 2,
    );
  }
  // "X minutes"
  for (const m of lc.matchAll(/(\d+)\s*(?:minutes?|mins?)/g)) {
    maxMinutes = Math.max(maxMinutes, parseInt(m[1]!));
  }
  // "X hours"
  for (const m of lc.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/g)) {
    maxMinutes = Math.max(maxMinutes, parseFloat(m[1]!) * 60);
  }

  if (maxMinutes > 0) {
    // Add base active-prep time (chopping, measuring), cap at 4 hours
    return Math.min(Math.round(maxMinutes + 10), 240);
  }

  return CATEGORY_FALLBACK_MINUTES[category] ?? 30;
}

// ── Nutrition (category-based estimates) ──────────────────────────────────

const CATEGORY_NUTRITION: Record<string, Nutrition> = {
  Beef: { calories: 560, protein: 38, carbs: 42, fat: 22 },
  Chicken: { calories: 480, protein: 42, carbs: 36, fat: 14 },
  Lamb: { calories: 570, protein: 36, carbs: 40, fat: 24 },
  Pork: { calories: 520, protein: 36, carbs: 42, fat: 18 },
  Goat: { calories: 520, protein: 34, carbs: 40, fat: 18 },
  Pasta: { calories: 610, protein: 24, carbs: 86, fat: 18 },
  Seafood: { calories: 380, protein: 36, carbs: 28, fat: 10 },
  Vegetarian: { calories: 380, protein: 18, carbs: 60, fat: 12 },
  Vegan: { calories: 350, protein: 14, carbs: 62, fat: 8 },
  Breakfast: { calories: 420, protein: 22, carbs: 48, fat: 16 },
  Miscellaneous: { calories: 450, protein: 22, carbs: 52, fat: 16 },
  Starter: { calories: 280, protein: 12, carbs: 30, fat: 12 },
  Side: { calories: 200, protein: 6, carbs: 35, fat: 6 },
};

const DEFAULT_NUTRITION: Nutrition = {
  calories: 450,
  protein: 22,
  carbs: 50,
  fat: 16,
};

export function estimateNutrition(category: string): Nutrition {
  return CATEGORY_NUTRITION[category] ?? DEFAULT_NUTRITION;
}

// ── Instruction splitting ──────────────────────────────────────────────────

/** Split a raw instructions blob into a clean list of steps. */
export function splitInstructions(raw: string): string[] {
  if (!raw?.trim()) return [];

  // Normalise line endings
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Try numbered steps first: "1. …" or "1) …" or "Step 1:"
  const numbered = text.match(
    /(?:^|\n)\s*(?:step\s*)?\d+[.)]\s*.+?(?=(?:\n\s*(?:step\s*)?\d+[.)])|$)/gis,
  );
  if (numbered && numbered.length > 2) {
    return numbered
      .map((s) => s.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, "").trim())
      .filter((s) => s.length > 10);
  }

  // Fall back to paragraph splitting (double newlines)
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length > 2) {
    return paragraphs
      .map((p) => p.replace(/\n/g, " ").trim())
      .filter((p) => p.length > 10);
  }

  // Fall back to single newline splitting
  const lines = text.split("\n");
  if (lines.length > 2) {
    return lines.map((l) => l.trim()).filter((l) => l.length > 10);
  }

  // Last resort: sentence splitting on ". " followed by capital
  return text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}
