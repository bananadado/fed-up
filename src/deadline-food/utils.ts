import { getPlanMeal, getRecipeCatalogue, getSessionMeal } from "./recipeCatalogue";
import type { Deadline, Meal, NutritionSource, RecipeIngredient } from "./types";
import { formatIngredient, ingredientName } from "./ingredients";

export function parseICS(text: string): Deadline[] | null {
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  const parsed = blocks.map((block, index) => {
    const title = (block.match(/SUMMARY:(.+)/)?.[1] || `Imported event ${index + 1}`).trim();
    const raw = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{4}))?/) || [];
    const date = raw[1] ? new Date(`${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}T12:00:00`) : null;
    const label = date ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Upcoming";
    const time = raw[2] ? `${raw[2].slice(0, 2)}:${raw[2].slice(2, 4)}` : "All day";
    return { id: `ics-${index}`, title, date: label, time, intensity: "Imported", eventType: "general" as const, effortHours: 1, urgency: "medium" as const };
  });
  return parsed.length ? parsed.slice(0, 5) : null;
}

export function money(n: number) {
  return `£${n.toFixed(2)}`;
}

/**
 * Returns the source as a normalised http(s) URL if it looks like one,
 * otherwise null. Used to decide whether a recipe source should render as a
 * clickable link (issue #146) or as plain text (e.g. "Budget Bytes").
 */
export function sourceUrl(source: string | undefined | null): string | null {
  if (!source) return null;

  const trimmed = source.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

export function formatCookingLimit(minutes: number | null) {
  if (minutes === null) {
    return "Unlimited";
  }

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours} hr${hours === 1 ? "" : "s"}` : `${hours} hr ${remainingMinutes} min`;
  }

  return `${minutes} min`;
}

/**
 * Whether a recipe is curated/verified content rather than user-contributed
 * (#213). Backend-sourced recipes carry an explicit `verified` flag; local seed
 * data has no flag and is verified iff it was not user-created, so seeds read as
 * verified without having to stamp every entry.
 */
export function isVerified(meal: Meal): boolean {
  return meal.verified === true || (meal.verified === undefined && !meal.isUserCreated);
}

export function isMealDietaryCompatible(meal: Meal, dietary: string[]): boolean {
  if (dietary.length === 0) return true;
  const d = dietary.map((x) => x.toLowerCase());
  const tags = meal.tags.map((t) => t.toLowerCase());
  if (d.includes("vegan") && !tags.includes("vegan")) return false;
  if (d.includes("vegetarian") && !tags.includes("vegetarian") && !tags.includes("vegan")) return false;
  if (d.includes("halal") && !tags.includes("halal") && !tags.includes("vegetarian") && !tags.includes("vegan")) return false;
  // gluten-free / dairy-free already covered by allergen check in `avoided`
  return true;
}

/**
 * Whether the given account owns this recipe (#213 follow-up). Locally-created
 * recipes are owned; a recipe opened via share link is owned when its stored
 * ownerUid matches the signed-in account, so an owner keeps control across
 * devices. Used to gate publish/unpublish/delete controls.
 */
export function isRecipeOwnedBy(meal: Meal | undefined | null, accountUid: string | null | undefined): boolean {
  if (!meal) return false;
  return meal.isUserCreated === true || (!!meal.ownerUid && meal.ownerUid === accountUid);
}

export function mealById(id: string, customRecipes: Meal[], extra: Meal[] = []) {
  return (
    [...extra, ...customRecipes, ...getRecipeCatalogue()].find((meal) => meal.id === id) ??
    getPlanMeal(id) ??
    getSessionMeal(id)
  );
}

export function getMealById(id: string, customRecipes: Meal[]) {
  const meal = mealById(id, customRecipes);

  if (!meal) {
    return getRecipeCatalogue()[0] as Meal;
  }

  return meal;
}

export function nutritionSourceSummary(source: NutritionSource | undefined) {
  if (!source) return "Manual estimate";

  const missing = source.missingIngredients ?? [];

  if ((source.matchedIngredients?.length ?? 0) === 0 && missing.length === 0) {
    return source.label;
  }

  return missing.length > 0
    ? `${source.label} · couldn't find: ${missing.join(", ")}`
    : `${source.label} · all matched`;
}

export { ingredientName };

export const ingredientLabel = formatIngredient;

export function ingredientNames(
  ingredients: RecipeIngredient[],
  limit?: number
): string {
  return ingredients
    .slice(0, limit)
    .map(ingredientName)
    .join(", ");
}

const NAME_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "with", "in", "on", "of", "for",
  "to", "from", "by", "&", "style", "based",
]);

// Base pantry staples (oils, salt, pepper, water, flour, sugar). These are
// assumed on hand and don't characterise a dish, so they are excluded from
// key-ingredient selection (issue #249, e.g. "sunflower oil").
const PANTRY_STAPLE_NOUNS = new Set([
  "oil", "salt", "pepper", "water", "flour", "sugar",
]);
// Modifiers that qualify a staple noun without changing that it's a staple,
// e.g. "sunflower oil", "sea salt", "self-raising flour", "caster sugar".
const PANTRY_STAPLE_MODIFIERS = new Set([
  "sunflower", "vegetable", "olive", "extra", "virgin", "sesame", "coconut",
  "rapeseed", "canola", "groundnut", "peanut", "sea", "table", "kosher",
  "black", "white", "ground", "cracked", "caster", "granulated", "icing",
  "plain", "self", "raising", "all", "purpose", "cold", "warm", "boiling",
]);

/**
 * True when an ingredient is a base pantry staple — every word is either a
 * staple noun (oil, salt, …) or a recognised modifier, and at least one is a
 * staple noun. This keeps "soy sauce" or "lemon juice" out while catching
 * "sunflower oil", "black pepper", "all-purpose flour", etc.
 */
function isPantryStaple(name: string): boolean {
  const words = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return false;

  return (
    words.some((w) => PANTRY_STAPLE_NOUNS.has(w)) &&
    words.every(
      (w) => PANTRY_STAPLE_NOUNS.has(w) || PANTRY_STAPLE_MODIFIERS.has(w),
    )
  );
}

/**
 * Returns the top `limit` key ingredients for a named dish, ranked so that
 * ingredients mentioned in the dish name appear first. Ingredients with no
 * name-word match fall back to their original list order. Base pantry staples
 * (oils, salt, pepper, water, flour, sugar) are excluded so the slots go to
 * ingredients that actually characterise the dish; if a recipe is *only*
 * staples they are kept so we never show an empty list.
 */
export function keyIngredients(
  name: string,
  ingredients: RecipeIngredient[],
  limit = 5,
): string {
  const significant = ingredients.filter(
    (ingredient) => !isPantryStaple(ingredientName(ingredient)),
  );
  const pool = significant.length > 0 ? significant : ingredients;

  const titleWords = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NAME_STOPWORDS.has(w));

  if (titleWords.length === 0) {
    return ingredientNames(pool, limit);
  }

  const scored = pool.map((ingredient, index) => {
    const ingName = ingredientName(ingredient).toLowerCase();
    const score = titleWords.filter((w) => ingName.includes(w)).length;
    return { ingredient, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored
    .slice(0, limit)
    .map(({ ingredient }) => ingredientName(ingredient))
    .join(", ");
}
