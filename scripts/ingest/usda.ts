/**
 * USDA FoodData Central ingredient lookup.
 *
 * USDA is a far better source than OpenFoodFacts for raw cooking ingredients
 * (garlic, onion, flour, chicken breast, …) because it indexes generic foods
 * rather than barcoded retail products. Results are normalised into the same
 * per-100g `OpenFoodFactsProduct` shape the rest of the pipeline (and the live
 * `deadlineFoodNutrition` function) already understands, tagged with
 * `provider: "USDA"`.
 *
 * Standard FDC nutrient numbers (all reported per 100 g for non-branded foods):
 *   208 Energy (kcal)        957/958 Energy (Atwater) — used as a fallback
 *   203 Protein
 *   205 Carbohydrate, by difference
 *   204 Total lipid (fat)
 *
 * The search API is rate limited per API key:
 *   DEMO_KEY      ~10 requests/hour (only good for spot checks)
 *   signed key    1,000 requests/hour (free: https://fdc.nal.usda.gov/api-key-signup.html)
 *
 * Set USDA_API_KEY to a signed key before bulk runs.
 */

import type { NutritionProvider, OpenFoodFactsProduct } from "./openfoodfacts.ts";

// ── Config ───────────────────────────────────────────────────────────────────

const FDC_BASE_URL = (
  process.env["USDA_FDC_BASE_URL"] ?? "https://api.nal.usda.gov/fdc"
).replace(/\/$/, "");

export const USDA_API_KEY = process.env["USDA_API_KEY"] ?? "DEMO_KEY";

const FDC_TIMEOUT_MS = 8000;

/**
 * Retry attempts for transient FDC failures. The api-umbrella gateway sprays
 * spurious 4xx (often 400) and 429s under load — observed ~20% of requests fail
 * transiently even at 1 req/sec — so we retry on ANY non-2xx, not just 5xx.
 */
const FDC_MAX_ATTEMPTS = 6;

/**
 * Data types worth searching. Foundation and SR Legacy hold generic single-
 * ingredient foods; Survey (FNDDS) covers prepared dishes; Branded is barcoded
 * retail products. We search all four but, within the top relevance hits, prefer
 * the generic ones — see GENERIC_DATA_TYPES / PREFER_WINDOW below.
 */
const FDC_DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"];

/** Non-branded data types: generic foods with cleaner per-100g nutrition. */
const GENERIC_DATA_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);

/**
 * How far down the relevance list a generic food may sit and still be preferred
 * over a higher-ranked Branded hit. Small enough that only genuinely relevant
 * generic foods win (avoids "self-raising flour" → a weakly-ranked shrimp entry),
 * large enough to reach "Bananas, raw" when "banana" is dominated by branded
 * banana-chip products up top.
 */
const PREFER_WINDOW = 12;

export const USDA_PROVIDER: NutritionProvider = "USDA";

/** Thrown when FDC keeps failing transiently — the caller must NOT cache a miss. */
export class UsdaTransientError extends Error {}

/**
 * Aliases for ingredient names USDA doesn't index under that spelling —
 * misspellings in the recipe source and regional/foreign names. Keyed by the
 * de-accented, lower-cased ingredient name. Only the USDA *query* is rewritten;
 * the cache key stays the original ingredient name.
 */
const INGREDIENT_ALIASES: Record<string, string> = {
  "challots": "shallots", // misspelling of "shallots"
  "cassaba": "casaba", // misspelling of the casaba melon
  "jamon iberico": "prosciutto", // closest USDA dry-cured ham analog
  "khus khus": "spices poppy seed", // regional name for poppy seeds
  "mulukhiyah": "jute", // jute mallow leaves → "Jute, potherb, raw"
};

/** Strip diacritics so e.g. "Gruyère" / "jamón" match USDA's ASCII index. */
function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ── FDC wire types ───────────────────────────────────────────────────────────

type FdcNutrient = {
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
};

type FdcFood = {
  fdcId?: number;
  description?: string;
  dataType?: string;
  foodNutrients?: FdcNutrient[];
};

type FdcSearchResponse = {
  foods?: FdcFood[];
};

// ── Mapping ──────────────────────────────────────────────────────────────────

function nutrientValue(food: FdcFood, ...numbers: string[]): number | undefined {
  for (const number of numbers) {
    const hit = food.foodNutrients?.find((n) => String(n.nutrientNumber) === number);
    if (hit && typeof hit.value === "number") return hit.value;
  }
  return undefined;
}

/**
 * Map an FDC food onto the per-100g product shape, or null when it lacks the
 * four macros we need. Energy falls back to the Atwater estimates (957/958)
 * which some Foundation foods carry instead of nutrient 208.
 */
function toProduct(food: FdcFood): OpenFoodFactsProduct | null {
  const calories = nutrientValue(food, "208", "957", "958");
  const protein = nutrientValue(food, "203");
  const carbs = nutrientValue(food, "205");
  const fat = nutrientValue(food, "204");

  if (
    typeof calories !== "number" ||
    typeof protein !== "number" ||
    typeof carbs !== "number" ||
    typeof fat !== "number"
  ) {
    return null;
  }

  return {
    provider: USDA_PROVIDER,
    ...(typeof food.fdcId === "number" ? { code: String(food.fdcId) } : {}),
    ...(food.description ? { product_name: food.description } : {}),
    nutriments: {
      "energy-kcal_100g": calories,
      proteins_100g: protein,
      carbohydrates_100g: carbs,
      fat_100g: fat,
    },
  };
}

// ── Search ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/**
 * Run one FDC search, retrying on ANY non-2xx response (the gateway emits
 * spurious 400/429s under load) and on network/timeout errors, with backoff
 * that honours `Retry-After`. Only a real HTTP 200 is treated as authoritative —
 * even one with zero foods, which is a genuine "no such food". If every attempt
 * fails we throw `UsdaTransientError` so the caller leaves the ingredient
 * uncached rather than poisoning the cache with a false miss.
 */
async function searchFoods(query: string): Promise<FdcFood[]> {
  // FDC_BASE_URL carries a `/fdc` path, so concatenate rather than use the
  // URL(base) form (a leading-slash path would resolve against the origin only).
  const url = new URL(`${FDC_BASE_URL}/v1/foods/search`);
  url.searchParams.set("api_key", USDA_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", FDC_DATA_TYPES.join(","));

  let lastStatus = "network error";
  for (let attempt = 1; attempt <= FDC_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FDC_TIMEOUT_MS),
    }).catch(() => null);

    if (response?.ok) {
      const payload = (await response.json().catch(() => null)) as FdcSearchResponse | null;
      return payload?.foods ?? [];
    }

    lastStatus = response ? `HTTP ${response.status}` : "network error";

    if (attempt < FDC_MAX_ATTEMPTS) {
      const retryAfter = Number(response?.headers.get("retry-after"));
      // 429s carry Retry-After and want a real cooldown; the spurious 400s clear
      // immediately, so use a short jittered backoff for them.
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ?
        retryAfter * 1000 :
        400 + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
  }

  throw new UsdaTransientError(
    `USDA search failed after ${FDC_MAX_ATTEMPTS} attempts (${lastStatus}): ${query}`,
  );
}

/**
 * Look up the best USDA product for an ingredient name. Returns the normalised
 * per-100g product (provider "USDA") or null when nothing usable is found.
 * `onSearch` fires once per FDC HTTP request so callers can rate-limit. Throws
 * `UsdaTransientError` if FDC keeps failing transiently.
 */
export async function findUsdaProductForIngredient(
  name: string,
  onSearch?: (query: string) => Promise<void> | void,
): Promise<OpenFoodFactsProduct | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // De-accent, then apply any alias for misspelled/regional names. The rewrite
  // only affects the USDA query — callers still cache under the original name.
  const deaccented = deaccent(trimmed);
  const query = INGREDIENT_ALIASES[deaccented.toLowerCase()] ?? deaccented;

  await onSearch?.(query);
  const foods = await searchFoods(query);

  // Walk results in USDA's relevance order (never reorder globally — that once
  // promoted an off-topic "self-raising flour → shrimp"). Among the top
  // PREFER_WINDOW hits we prefer cleaner generic, whole-ingredient foods, in
  // descending preference:
  //   1. a generic food described as raw/fresh ("Garlic, raw" over "Garlic sauce")
  //   2. any generic (non-branded) food ("Spices, pepper, black")
  // Anything else falls back to the first complete-macro hit in relevance order.
  let rawGeneric: OpenFoodFactsProduct | null = null;
  let anyGeneric: OpenFoodFactsProduct | null = null;
  let fallback: OpenFoodFactsProduct | null = null;

  for (let i = 0; i < foods.length; i++) {
    const food = foods[i]!;
    const product = toProduct(food);
    if (!product) continue;

    if (fallback === null) fallback = product;
    if (i >= PREFER_WINDOW) continue;

    if (GENERIC_DATA_TYPES.has(food.dataType ?? "")) {
      if (anyGeneric === null) anyGeneric = product;
      if (rawGeneric === null && /\b(raw|fresh)\b/i.test(food.description ?? "")) {
        rawGeneric = product;
      }
    }
  }

  return rawGeneric ?? anyGeneric ?? fallback;
}
