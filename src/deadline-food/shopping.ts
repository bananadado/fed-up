import type { Meal, PlanEntry, RecipeIngredient } from "./types";
import { ITEM_WEIGHT_G, formatIngredient } from "./ingredients";
import { mealById } from "./utils";
import { normalizeIngredientUnit } from "./unitConversion";
import { estimateIngredientCostPence } from "@/domain/ingredientCosting";

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

function singularise(name: string): string {
  if (NON_PLURAL_S.has(name)) return name;
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

function aggregationUnit(unit: string): string {
  if (unit in MASS_TO_G) return "g";
  if (unit in VOLUME_TO_ML) return "ml";
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
  return { quantity, unit };
}

function shoppingIngredientKey(ingredient: ShoppingIngredient) {
  if (typeof ingredient === "string") return normaliseIngredient(ingredient);
  const { baseName, sigPrep } = extractIngredientParts(ingredient);
  const unitPart = aggregationUnit(ingredient.unit);
  return sigPrep ? `${baseName}:${unitPart}:${sigPrep}` : `${baseName}:${unitPart}`;
}


function pluralise(name: string): string {
  if (name.endsWith("y") && !/[aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (name.endsWith("o") && !name.endsWith("oo")) return `${name}es`;
  if (!name.endsWith("s")) return `${name}s`;
  return name;
}

export function shoppingItemLabel(item: ShoppingItem) {
  if (typeof item.quantity === "number" && item.unit) {
    if (item.unit === "serving") {
      if (item.quantity <= 1) return item.name;
      const qty = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toFixed(1);
      return `${qty} ${pluralise(item.name)}`;
    }
    return formatIngredient({ name: item.name, quantity: item.quantity, unit: item.unit });
  }

  return item.count > 1 ? `${item.name} x${item.count}` : item.name;
}

function hintPlural(name: string, count: number): string {
  if (count === 1) return name;
  if (name.endsWith("o") && !name.endsWith("oo")) return `${name}es`;
  return `${name}s`;
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

/** How the shopping list is scoped: the next week's trip, or the whole plan. */
export type ShoppingScope = "week" | "all";

/** Day entries counted as the "next shopping trip" horizon when scoped to a week. */
export const SHOPPING_SCOPE_DAYS = 7;

/**
 * Narrow a plan to the entries one shopping trip should cover. Plan entries are
 * one-per-day and ordered forward from today, so "week" keeps the next
 * {@link SHOPPING_SCOPE_DAYS} entries and "all" keeps the full plan.
 */
export function scopePlanEntries(plan: PlanEntry[], scope: ShoppingScope): PlanEntry[] {
  return scope === "week" ? plan.slice(0, SHOPPING_SCOPE_DAYS) : plan;
}

/**
 * Rough illustrative total for a shopping list, in pounds. Sums per-ingredient
 * estimates from the shared cost table (no per-recipe floor) so the figure tracks
 * exactly the items shown. Count-only items fall back to a generic "item" measure.
 */
export function estimateShoppingListCost(items: ShoppingItem[]): number {
  const pence = items.reduce((sum, item) => {
    const measurable = typeof item.quantity === "number" && item.unit
      ? { name: item.name, quantity: item.quantity, unit: item.unit }
      : { name: item.name, quantity: item.count, unit: "item" };
    return sum + estimateIngredientCostPence(measurable).pricePence;
  }, 0);
  return Number((pence / 100).toFixed(2));
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
