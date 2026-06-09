import type { Meal, PlanEntry, RecipeIngredient } from "./types";
import { formatIngredient } from "./ingredients";
import { getMealById } from "./utils";
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

function singularise(name: string): string {
  if (NON_PLURAL_S.has(name)) return name;
  if (name.endsWith("ies") && name.length > 4) return `${name.slice(0, -3)}y`;
  if (name.endsWith("oes") && name.length > 3) return name.slice(0, -2);
  if (name.endsWith("s") && !name.endsWith("ss") && name.length > 3) return name.slice(0, -1);
  return name;
}

function shoppingIngredientName(ingredient: ShoppingIngredient) {
  return typeof ingredient === "string" ? ingredient.trim() : ingredient.name.trim();
}

function shoppingIngredientKey(ingredient: ShoppingIngredient) {
  if (typeof ingredient === "string") {
    return normaliseIngredient(ingredient);
  }

  return `${singularise(normaliseIngredient(ingredient.name))}:${ingredient.unit}`;
}

function addPreparation(preparations: string[] | undefined, preparation: string | undefined) {
  if (!preparation) {
    return preparations;
  }

  const current = preparations ?? [];

  return current.includes(preparation) ? current : [...current, preparation];
}

export function shoppingItemLabel(item: ShoppingItem) {
  if (typeof item.quantity === "number" && item.unit) {
    return formatIngredient({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    });
  }

  return item.count > 1 ? `${item.name} x${item.count}` : item.name;
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
      : singularise(normaliseIngredient(ingredient.name));

    if (!name) {
      return;
    }

    const current = items.get(key);

    if (typeof ingredient === "string") {
      items.set(key, current ? { ...current, count: current.count + 1 } : { name, count: 1 });
      return;
    }

    items.set(key, current ? {
      ...current,
      count: current.count + 1,
      quantity: (current.quantity ?? 0) + ingredient.quantity,
      preparations: addPreparation(current.preparations, ingredient.preparation),
    } : {
      name,
      count: 1,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      preparations: addPreparation(undefined, ingredient.preparation),
    });
  });

  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
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
) {
  const available = new Set(availableIngredients.map((ingredient) => normaliseIngredient(ingredient.name)));

  const rawIngredients = plan.flatMap((entry) =>
    entry.meals.flatMap((planMeal) => getMealById(planMeal.mealId, customRecipes).ingredients),
  );
  const normalised = rawIngredients.map((ing) => normalizeIngredientUnit(ing, unitSystem));

  return aggregateIngredients(normalised).filter(
    (item) => !available.has(normaliseIngredient(item.name)) && !ALWAYS_AVAILABLE.has(normaliseIngredient(item.name)),
  );
}
