/**
 * TheMealDB data source.
 *
 * API docs: https://www.themealdb.com/api.php (free tier, no key required)
 * Rate limit: none documented; we add a small courtesy delay between requests.
 *
 * Categories we skip:
 *   - Dessert (not relevant for student meal planning)
 */

import type { FirestoreMeal, Ingredient, RecipeIn } from "../types.ts";
import { estimatePricePence } from "../prices.ts";
import {
  detectAllergens,
  detectDietaryTags,
  detectSuitabilityTags,
  estimateNutrition,
  estimatePrepMinutes,
  extractEquipment,
  extractTechniques,
  inferFlavorProfile,
  splitInstructions,
} from "../normalise.ts";

const BASE = "https://www.themealdb.com/api/json/v1/1";
const DELAY_MS = 150;
const SKIP_CATEGORIES = new Set(["Dessert"]);

const CATEGORY_EMOJI: Record<string, string> = {
  Beef: "🥩",
  Chicken: "🍗",
  Lamb: "🥩",
  Pork: "🥩",
  Goat: "🥩",
  Pasta: "🍝",
  Seafood: "🐟",
  Vegetarian: "🥦",
  Vegan: "🌱",
  Breakfast: "🍳",
  Miscellaneous: "🍽️",
  Starter: "🥗",
  Side: "🥗",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── TheMealDB wire types ───────────────────────────────────────────────────

type CategoryListResponse = {
  categories: Array<{ strCategory: string }>;
};

type MealSummaryResponse = {
  meals: Array<{ idMeal: string; strMeal: string }> | null;
};

type MealDetail = {
  idMeal: string;
  strMeal: string;
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string;
  strTags: string | null;
  strSource: string | null;
  [key: `strIngredient${number}`]: string | null;
  [key: `strMeasure${number}`]: string | null;
};

type MealDetailResponse = {
  meals: MealDetail[] | null;
};

// ── Ingredient extraction ─────────────────────────────────────────────────

/** Extract the up-to-20 ingredient+measure pairs TheMealDB encodes as numbered fields. */
function extractRawIngredients(
  meal: MealDetail,
): Array<{ name: string; measure: string }> {
  const result: Array<{ name: string; measure: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) break;
    const measure = meal[`strMeasure${i}`]?.trim() ?? "";
    result.push({ name, measure });
  }
  return result;
}

/** Parse a TheMealDB measure string into (quantity, unit) for the Ingredient schema. */
function parseMeasureToIngredient(
  name: string,
  measure: string,
): Ingredient {
  const s = measure.trim().toLowerCase();

  // Patterns: "200g", "1 tbs", "3/4 cup", "2 medium", "To taste", etc.
  const weightMatch = s.match(/^(\d+(?:[./]\d+)?)\s*(g|kg|oz|lb)?\b/);
  const volMatch = s.match(/^(\d+(?:[./]\d+)?)\s*(ml|l|litre|liter)\b/i);
  const tbspMatch = s.match(/^(\d+(?:[./]\d+)?)\s*(?:tbsp|tablespoon|tbs)\b/i);
  const tspMatch = s.match(/^(\d+(?:[./]\d+)?)\s*(?:tsp|teaspoon)\b/i);
  const cupMatch = s.match(/^(\d+(?:[./]\d+)?)\s*cup/i);

  function qty(raw: string): number {
    const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return parseInt(m[1]!) / parseInt(m[2]!);
    return parseFloat(raw) || 1;
  }

  if (tbspMatch) return { name, quantity: qty(tbspMatch[1]!), unit: "tbsp" };
  if (tspMatch) return { name, quantity: qty(tspMatch[1]!), unit: "tsp" };
  if (cupMatch) return { name, quantity: qty(cupMatch[1]!), unit: "cup" };

  if (volMatch) {
    const unit = volMatch[2]?.toLowerCase() ?? "ml";
    return { name, quantity: qty(volMatch[1]!), unit };
  }

  if (weightMatch && weightMatch[2]) {
    return { name, quantity: qty(weightMatch[1]!), unit: weightMatch[2] };
  }

  // Fallback: if there's any number, treat as count
  const numMatch = s.match(/^(\d+(?:[./]\d+)?)/);
  if (numMatch) {
    const q = qty(numMatch[1]!);
    // Infer unit from the remainder of the measure string
    const rest = s.slice(numMatch[0].length).trim();
    const unit = rest || "item";
    return { name, quantity: q, unit };
  }

  // "to taste", "pinch", etc. → tiny quantity
  return { name, quantity: 1, unit: "pinch" };
}

// ── meal_type assignment ──────────────────────────────────────────────────

function assignMealType(prepMinutes: number): "cook" | "quick_cook" {
  return prepMinutes <= 10 ? "quick_cook" : "cook";
}

// ── meal_slots assignment ─────────────────────────────────────────────────

function assignMealSlots(category: string): string[] {
  if (category === "Breakfast") return ["breakfast"];
  if (category === "Starter" || category === "Side") return ["lunch"];
  return ["lunch", "dinner"];
}

// ── Main normalisation ─────────────────────────────────────────────────────

function normalise(meal: MealDetail): { recipe: RecipeIn; firestoreMeal: FirestoreMeal } {
  const raw = extractRawIngredients(meal);
  const ingredientNames = raw.map((r) => r.name);

  const instructions = splitInstructions(meal.strInstructions ?? "");
  const fullInstructionsText = instructions.join(" ");

  const prepMinutes = estimatePrepMinutes(meal.strInstructions ?? "", meal.strCategory);
  const allergens = detectAllergens(ingredientNames);
  const dietaryTags = detectDietaryTags(ingredientNames, meal.strCategory);
  const suitabilityTags = detectSuitabilityTags(prepMinutes, ingredientNames, fullInstructionsText);
  const nutrition = estimateNutrition(meal.strCategory);
  const flavorProfile = inferFlavorProfile(meal.strArea);
  const techniques = extractTechniques(fullInstructionsText);
  const equipment = extractEquipment(fullInstructionsText);
  const pricePence = estimatePricePence(raw);
  const mealType = assignMealType(prepMinutes);
  const mealSlots = assignMealSlots(meal.strCategory);
  const ingredients = raw.map(({ name, measure }) => parseMeasureToIngredient(name, measure));

  const cuisine = meal.strArea === "Unknown" ? undefined : meal.strArea;
  const source = meal.strSource ?? `TheMealDB (${meal.idMeal})`;
  const photoUrl = meal.strMealThumb ?? undefined;
  const image = CATEGORY_EMOJI[meal.strCategory] ?? "🍽️";

  // Stable ID using TheMealDB's own ID
  const id = `tmdb-${meal.idMeal}`;

  // Tags from strTags if present
  const extraTags = meal.strTags
    ? meal.strTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  const allDietaryTags = [...new Set([...dietaryTags, ...extraTags])];

  const recipe: RecipeIn = {
    id,
    name: meal.strMeal,
    meal_type: mealType,
    meal_slots: mealSlots,
    price_pence: pricePence,
    prep_minutes: prepMinutes,
    dietary_tags: allDietaryTags,
    allergens,
    suitability_tags: suitabilityTags,
    ingredients,
    instructions,
    cuisine,
    flavor_profile: flavorProfile,
    techniques,
    equipment,
    nutrition,
    source,
    note: "",
    photoUrl,
  };

  const firestoreMeal: FirestoreMeal = {
    id,
    name: meal.strMeal,
    type: mealType === "quick_cook" ? "cook" : mealType,
    mealSlots: mealSlots,
    time: prepMinutes,
    price: pricePence / 100,
    tags: allDietaryTags,
    ingredients,
    allergens,
    nutrition,
    rating: 0,
    reviews: [],
    instructions,
    source,
    note: "",
    image,
    photoUrl,
  };

  return { recipe, firestoreMeal };
}

// ── Public API ─────────────────────────────────────────────────────────────

export type NormalisedRecipe = {
  recipe: RecipeIn;
  firestoreMeal: FirestoreMeal;
};

export async function fetchCategories(): Promise<string[]> {
  const data = await getJson<CategoryListResponse>(`${BASE}/categories.php`);
  return data.categories
    .map((c) => c.strCategory)
    .filter((c) => !SKIP_CATEGORIES.has(c));
}

export async function fetchMealIdsByCategory(category: string): Promise<string[]> {
  await sleep(DELAY_MS);
  const data = await getJson<MealSummaryResponse>(
    `${BASE}/filter.php?c=${encodeURIComponent(category)}`,
  );
  return (data.meals ?? []).map((m) => m.idMeal);
}

export async function fetchMealDetail(id: string): Promise<MealDetail | null> {
  await sleep(DELAY_MS);
  const data = await getJson<MealDetailResponse>(`${BASE}/lookup.php?i=${id}`);
  return data.meals?.[0] ?? null;
}

/**
 * Fetch and normalise every meal from TheMealDB (minus skipped categories).
 * Calls `onProgress` after each meal is fetched so the caller can show a progress bar.
 */
export async function fetchAllMeals(
  options: {
    categories?: string[];
    onProgress?: (done: number, total: number, name: string) => void;
  } = {},
): Promise<NormalisedRecipe[]> {
  const categories = options.categories ?? (await fetchCategories());

  // First pass: collect all IDs so we can report total count
  const idsByCategory: Map<string, string[]> = new Map();
  for (const cat of categories) {
    idsByCategory.set(cat, await fetchMealIdsByCategory(cat));
  }

  const allIds = [...idsByCategory.values()].flat();
  const total = allIds.length;
  let done = 0;
  const results: NormalisedRecipe[] = [];
  const seen = new Set<string>();

  for (const [cat, ids] of idsByCategory) {
    for (const id of ids) {
      if (seen.has(id)) continue; // TheMealDB sometimes lists a meal in multiple categories
      seen.add(id);

      const meal = await fetchMealDetail(id);
      if (!meal) continue;

      // Use the actual category from the detail record (more reliable than the filter)
      const catForNorm = meal.strCategory || cat;
      if (SKIP_CATEGORIES.has(catForNorm)) { done++; continue; }

      results.push(normalise(meal));
      done++;
      options.onProgress?.(done, total, meal.strMeal);
    }
  }

  return results;
}
