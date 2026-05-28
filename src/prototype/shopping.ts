import type { Meal, PlanEntry } from "./types";
import { getMealById } from "./utils";

export type GroceryVendor = {
  id: string;
  label: string;
  searchUrl: (ingredient: string) => string;
};

export type ShoppingItem = {
  name: string;
  count: number;
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

function normaliseIngredient(value: string) {
  return value.trim().toLowerCase();
}

export function groceryVendorById(vendorId: string) {
  return groceryVendors.find((vendor) => vendor.id === vendorId) ?? groceryVendors[0];
}

export function aggregateIngredients(ingredients: string[]) {
  const items = new Map<string, ShoppingItem>();

  ingredients.forEach((ingredient) => {
    const key = normaliseIngredient(ingredient);

    if (!key) {
      return;
    }

    const current = items.get(key);
    items.set(key, current ? { ...current, count: current.count + 1 } : { name: ingredient.trim(), count: 1 });
  });

  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function formatShoppingList(items: ShoppingItem[]) {
  return items.map((item) => (item.count > 1 ? `${item.name} x${item.count}` : item.name)).join("\n");
}

export function shoppingItemKey(name: string) {
  return normaliseIngredient(name);
}

export function ingredientsFromPlan(plan: PlanEntry[], customRecipes: Meal[]) {
  return aggregateIngredients(
    plan.flatMap((entry) => entry.meals.flatMap((planMeal) => getMealById(planMeal.mealId, customRecipes).ingredients)),
  );
}
