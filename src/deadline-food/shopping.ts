import type { Meal, PlanEntry, RecipeIngredient } from "./types";
import { INGREDIENT_DENSITY_G_PER_ML, ITEM_WEIGHT_G, formatIngredient, isUncountableFood, pluraliseFoodName } from "./ingredients";
import { mealById } from "./utils";
import { normalizeIngredientUnit } from "./unitConversion";

export type GroceryVendor = {
  id: string;
  label: string;
  searchUrl: (ingredient: string) => string;
};

export type ShoppingItem = {
  name: string;
  count: number;
  quantity?: number;
  unit?: string;
  preparations?: string[];
};

export const groceryVendors: [GroceryVendor, ...GroceryVendor[]] = [
  {
    id: "tesco",
    label: "Tesco",
    searchUrl: (ingredient) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(ingredient)}&inputType=free+text`,
  },
  {
    id: "sainsburys",
    label: "Sainsbury's",
    searchUrl: (ingredient) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(ingredient)}`,
  },
  {
    id: "asda",
    label: "Asda",
    searchUrl: (ingredient) => `https://groceries.asda.com/search/${encodeURIComponent(ingredient)}`,
  },
  {
    id: "morrisons",
    label: "Morrisons",
    searchUrl: (ingredient) => `https://groceries.morrisons.com/search?q=${encodeURIComponent(ingredient)}`,
  },
  {
    id: "waitrose",
    label: "Waitrose",
    searchUrl: (ingredient) => `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodeURIComponent(ingredient)}`,
  },
  {
    id: "ocado",
    label: "Ocado",
    searchUrl: (ingredient) => `https://www.ocado.com/search?q=${encodeURIComponent(ingredient)}`,
  },
  {
    id: "iceland",
    label: "Iceland",
    searchUrl: (ingredient) => `https://www.iceland.co.uk/search?q=${encodeURIComponent(ingredient)}`,
  },
  {
    id: "coop",
    label: "Co-op",
    searchUrl: (ingredient) => `https://shop.coop.co.uk/search?term=${encodeURIComponent(ingredient)}`,
  },
];

const ALWAYS_AVAILABLE = new Set(["water", "warm water", "cold water", "hot water", "lukewarm water"]);

type ShoppingIngredient = RecipeIngredient | string;

function normaliseIngredient(value: string) {
  return value.trim().toLowerCase();
}

const NON_PLURAL_S = new Set(["hummus", "couscous", "asparagus"]);

// "knives"/"wives"/"lives" singularise to -fe; most -ves words to -f.
const VES_TO_FE = new Set(["knives", "wives", "lives"]);

function singularise(name: string): string {
  if (NON_PLURAL_S.has(name)) return name;
  if (name.endsWith("ves") && name.length > 4) {
    // leaves → leaf, loaves → loaf, halves → half, knives → knife
    const lastWord = name.split(/\s+/).pop() ?? name;
    return `${name.slice(0, -3)}${VES_TO_FE.has(lastWord) ? "fe" : "f"}`;
  }
  if (name.endsWith("ies") && name.length > 4) return `${name.slice(0, -3)}y`;
  if (name.endsWith("oes") && name.length > 3) return name.slice(0, -2);
  if (name.endsWith("s") && !name.endsWith("ss") && name.length > 3) return name.slice(0, -1);
  return name;
}

const SIGNIFICANT_PREPS = new Set(["cooked", "minced", "frozen", "raw", "tinned"]);
const PREP_CANONICAL = new Map<string, string>([["canned", "tinned"]]);
const ALL_PREP_WORDS = new Set([
  "chopped", "sliced", "diced", "grated", "mashed", "pressed", "peeled",
  "fresh", "dried", "frozen", "cooked", "raw", "toasted", "roasted", "ground",
  "shredded", "crushed", "drained", "rinsed", "minced", "tinned", "canned", "whole",
]);

function extractIngredientParts(ingredient: RecipeIngredient): { baseName: string; sigPrep: string } {
  const words = normaliseIngredient(ingredient.name).split(/\s+/).filter(Boolean);
  const sigPreps = new Set<string>();

  while (words.length > 1 && ALL_PREP_WORDS.has(words[0]!)) {
    const word = words.shift()!;
    const canonical = PREP_CANONICAL.get(word) ?? word;
    if (SIGNIFICANT_PREPS.has(canonical)) sigPreps.add(canonical);
  }

  for (const p of (ingredient.preparation ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const canonical = PREP_CANONICAL.get(p) ?? p;
    if (SIGNIFICANT_PREPS.has(canonical)) sigPreps.add(canonical);
  }

  return {
    baseName: singularise(words.join(" ")),
    sigPrep: [...sigPreps].sort().join("+"),
  };
}

function shoppingIngredientName(ingredient: ShoppingIngredient) {
  return typeof ingredient === "string" ? ingredient.trim() : ingredient.name.trim();
}

// Maps compatible metric units to a single grouping key so g+kg and ml+l merge.
const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000 };
// Generic "one whole unit" measures. Folding these into a single dimension lets
// "2 item" + "0.5 whole" of the same ingredient merge instead of splitting on
// the incidental unit word. Specific count units (clove, slice, wrap, can…)
// stay distinct — half a clove and half an onion are not interchangeable.
const COUNT_LIKE_UNITS = new Set(["item", "items", "serving", "servings", "whole", "piece", "pieces", "count"]);

function aggregationUnit(unit: string): string {
  if (unit in MASS_TO_G) return "g";
  if (unit in VOLUME_TO_ML) return "ml";
  if (COUNT_LIKE_UNITS.has(unit)) return "count";
  return unit;
}

function toBaseQty(quantity: number, unit: string): number {
  return quantity * (MASS_TO_G[unit] ?? VOLUME_TO_ML[unit] ?? 1);
}

function fromBaseQty(quantity: number, unit: string): { quantity: number; unit: string } {
  if (unit === "g") {
    return quantity >= 1000
      ? { quantity: Math.round(quantity / 10) / 100, unit: "kg" }
      : { quantity: Math.round(quantity * 10) / 10, unit: "g" };
  }
  if (unit === "ml") {
    return quantity >= 1000
      ? { quantity: Math.round(quantity / 10) / 100, unit: "l" }
      : { quantity: Math.round(quantity * 10) / 10, unit: "ml" };
  }
  // The "count" base renders through the natural-plural "serving" path.
  if (unit === "count") return { quantity: Math.round(quantity * 100) / 100, unit: "serving" };
  return { quantity, unit };
}

function shoppingIngredientKey(ingredient: ShoppingIngredient) {
  if (typeof ingredient === "string") return normaliseIngredient(ingredient);
  const { baseName, sigPrep } = extractIngredientParts(ingredient);
  const unitPart = aggregationUnit(ingredient.unit);
  return sigPrep ? `${baseName}:${unitPart}:${sigPrep}` : `${baseName}:${unitPart}`;
}


export function shoppingItemLabel(item: ShoppingItem) {
  if (typeof item.quantity === "number" && item.unit) {
    if (item.unit === "serving") {
      // Uncountable foods (oil, flour, garlic…) read wrong as "2 oils"; show the
      // bare name — a count of whole units is meaningless for them.
      if (item.quantity <= 1 || isUncountableFood(item.name)) return item.name;
      const qty = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toFixed(1);
      return `${qty} ${pluraliseFoodName(item.name)}`;
    }
    return formatIngredient({ name: item.name, quantity: item.quantity, unit: item.unit });
  }

  return item.count > 1 ? `${item.name} x${item.count}` : item.name;
}

function hintPlural(name: string, count: number): string {
  return count === 1 ? name : pluraliseFoodName(name);
}

export function countHint(item: ShoppingItem): string | null {
  if (typeof item.quantity !== "number" || !item.unit) return null;
  if (item.unit !== "g" && item.unit !== "kg") return null;
  const gramsPerUnit = ITEM_WEIGHT_G[item.name.toLowerCase()];
  if (!gramsPerUnit) return null;
  const totalG = item.unit === "kg" ? item.quantity * 1000 : item.quantity;
  const count = Math.round(totalG / gramsPerUnit);
  if (count < 1) return null;
  return `~${count} ${hintPlural(item.name, count)}`;
}

export function groceryVendorById(vendorId: string) {
  return groceryVendors.find((vendor) => vendor.id === vendorId) ?? groceryVendors[0];
}

export function aggregateIngredients(ingredients: ShoppingIngredient[]) {
  const items = new Map<string, ShoppingItem>();

  ingredients.forEach((ingredient) => {
    const key = shoppingIngredientKey(ingredient);

    if (!key) {
      return;
    }

    const name = typeof ingredient === "string"
      ? shoppingIngredientName(ingredient)
      : (() => { const { baseName, sigPrep } = extractIngredientParts(ingredient); return sigPrep ? `${sigPrep} ${baseName}` : baseName; })();

    if (!name) {
      return;
    }

    const current = items.get(key);

    if (typeof ingredient === "string") {
      items.set(key, current ? { ...current, count: current.count + 1 } : { name, count: 1 });
      return;
    }

    const baseUnit = aggregationUnit(ingredient.unit);
    const baseQty = toBaseQty(ingredient.quantity, ingredient.unit);

    items.set(key, current ? {
      ...current,
      count: current.count + 1,
      quantity: (current.quantity ?? 0) + baseQty,
    } : {
      name,
      count: 1,
      quantity: baseQty,
      unit: baseUnit,
    });
  });

  // Reconcile count / volume / mass measures of the same ingredient into a
  // single weight where conversion factors are known — per-item weight for
  // counts, density for volumes — so "17 carrots" + "907g carrots" or
  // "590g flour" + "2.7l flour" collapse into one row (shown in g/kg with a
  // "~N" hint where applicable). Dimensions we cannot convert stay separate.
  type Bucket = { count?: [string, ShoppingItem]; ml?: [string, ShoppingItem]; g?: [string, ShoppingItem] };
  const buckets = new Map<string, Bucket>();
  for (const [key, item] of items) {
    const bucket = buckets.get(item.name) ?? {};
    if (item.unit === "count") bucket.count = [key, item];
    else if (item.unit === "ml") bucket.ml = [key, item];
    else if (item.unit === "g") bucket.g = [key, item];
    buckets.set(item.name, bucket);
  }
  for (const [name, bucket] of buckets) {
    const head = name.split(/\s+/).pop() ?? name;
    const perItemGrams = ITEM_WEIGHT_G[name] ?? ITEM_WEIGHT_G[head];
    const density = INGREDIENT_DENSITY_G_PER_ML[head];
    const parts: Array<{ key: string; item: ShoppingItem; grams: number }> = [];
    if (bucket.g) parts.push({ key: bucket.g[0], item: bucket.g[1], grams: bucket.g[1].quantity ?? 0 });
    if (bucket.ml && density !== undefined) parts.push({ key: bucket.ml[0], item: bucket.ml[1], grams: (bucket.ml[1].quantity ?? 0) * density });
    if (bucket.count && perItemGrams !== undefined) parts.push({ key: bucket.count[0], item: bucket.count[1], grams: (bucket.count[1].quantity ?? 0) * perItemGrams });
    if (parts.length < 2) continue;
    const totalGrams = parts.reduce((sum, p) => sum + p.grams, 0);
    const totalCount = parts.reduce((sum, p) => sum + p.item.count, 0);
    for (const p of parts) items.delete(p.key);
    items.set(`${name}:g`, { name, count: totalCount, quantity: totalGrams, unit: "g" });
  }

  // Drop vague count amounts for uncountable foods that already have a measured
  // amount — a "sprinkle of flour" next to "200g flour" needs no extra row.
  const measuredNames = new Set<string>();
  for (const item of items.values()) {
    if (item.unit && item.unit !== "count") measuredNames.add(item.name);
  }
  for (const [key, item] of [...items]) {
    if (item.unit === "count" && isUncountableFood(item.name) && measuredNames.has(item.name)) {
      items.delete(key);
    }
  }

  return [...items.values()]
    .map((item) => {
      if (typeof item.quantity === "number" && item.unit) {
        const d = fromBaseQty(item.quantity, item.unit);
        return d.unit !== item.unit || d.quantity !== item.quantity ? { ...item, ...d } : item;
      }
      return item;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatShoppingList(items: ShoppingItem[]) {
  return items.map(shoppingItemLabel).join("\n");
}

export function shoppingItemKey(value: ShoppingItem | string) {
  if (typeof value === "string") {
    return normaliseIngredient(value);
  }

  return value.unit ? `${normaliseIngredient(value.name)}:${value.unit}` : normaliseIngredient(value.name);
}

export function ingredientsFromPlan(
  plan: PlanEntry[],
  customRecipes: Meal[],
  availableIngredients: RecipeIngredient[] = [],
  unitSystem: "metric" | "imperial" = "metric",
  deletedRecipeIds: Set<string> = new Set(),
) {
  const available = new Set(availableIngredients.map((i) => singularise(normaliseIngredient(i.name))));

  const rawIngredients = plan.flatMap((entry) =>
    entry.meals.flatMap((planMeal) => {
      // A removed recipe (deleted by its owner, or unresolvable) contributes no
      // shopping items — the slot needs a replacement first (#213 follow-up).
      const meal = deletedRecipeIds.has(planMeal.mealId) ? undefined : mealById(planMeal.mealId, customRecipes);
      return meal?.ingredients ?? [];
    }),
  );
  const normalised = rawIngredients.map((ing) => normalizeIngredientUnit(ing, unitSystem));

  return aggregateIngredients(normalised).filter(
    (item) => !available.has(item.name) && !ALWAYS_AVAILABLE.has(item.name),
  );
}
