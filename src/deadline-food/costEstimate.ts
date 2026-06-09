import type { RecipeIngredient } from "./types";

// Rough, illustrative grocery prices for estimating a recipe's total cost from
// its ingredients. These are deterministic, explainable stand-ins — not live
// supermarket prices — so a student does not have to calculate a total by hand
// (issue #116). The manual cost field always remains editable as the fallback.

// Price in £ per 100g (or 100ml, treating density ~1) for weight/volume units.
const PRICE_PER_100G: Record<string, number> = {
  chicken: 0.8,
  "chicken pieces": 0.85,
  tuna: 1.2,
  egg: 0.3,
  rice: 0.12,
  "microwave rice": 0.45,
  couscous: 0.3,
  noodles: 0.25,
  oats: 0.1,
  bread: 0.15,
  flatbread: 0.4,
  potato: 0.1,
  "jacket potato": 0.12,
  broccoli: 0.3,
  carrot: 0.09,
  cucumber: 0.2,
  lettuce: 0.4,
  "salad leaves": 0.6,
  spinach: 0.5,
  tomato: 0.3,
  pepper: 0.4,
  peas: 0.2,
  sweetcorn: 0.25,
  edamame: 0.6,
  "mixed vegetables": 0.25,
  "mixed beans": 0.2,
  "baked beans": 0.15,
  hummus: 0.5,
  "peanut butter": 0.5,
  yoghurt: 0.25,
  "oat milk": 0.12,
  cheese: 0.8,
  banana: 0.12,
  apple: 0.2,
  berries: 1.0,
};

// Price in £ per single item for countable units (item, slice, can, etc.).
const PRICE_PER_ITEM: Record<string, number> = {
  egg: 0.2,
  banana: 0.15,
  apple: 0.25,
  "tortilla wrap": 0.2,
  flatbread: 0.3,
  bread: 0.06,
  "jacket potato": 0.2,
  potato: 0.15,
  tomato: 0.2,
  pepper: 0.4,
  cucumber: 0.5,
  lemon: 0.3,
  lime: 0.25,
  "microwave rice": 0.7,
  "vegetable sushi": 2.5,
  hummus: 1.0,
  "baked beans": 0.5,
  "mixed beans": 0.7,
  tuna: 1.0,
};

const DEFAULT_PRICE_PER_100G = 0.3;
const DEFAULT_PRICE_PER_ITEM = 0.4;
// Small-measure units (a spoon / cup of something) contribute only a token cost.
const SMALL_MEASURE_PRICE = 0.1;

const WEIGHT_UNITS_TO_GRAMS: Record<string, number> = {
  g: 1,
  ml: 1,
  kg: 1000,
  l: 1000,
};
const SMALL_MEASURE_UNITS = new Set(["tsp", "tbsp", "cup", "serving"]);

function estimateIngredientCost(ingredient: RecipeIngredient): number {
  const name = ingredient.name.trim().toLowerCase();
  const unit = ingredient.unit.trim().toLowerCase();
  const quantity = Number.isFinite(ingredient.quantity) && ingredient.quantity > 0 ? ingredient.quantity : 0;

  if (quantity === 0) return 0;

  const grams = WEIGHT_UNITS_TO_GRAMS[unit];
  if (grams !== undefined) {
    const pricePer100g = PRICE_PER_100G[name] ?? DEFAULT_PRICE_PER_100G;
    return (quantity * grams / 100) * pricePer100g;
  }

  if (SMALL_MEASURE_UNITS.has(unit)) {
    return quantity * SMALL_MEASURE_PRICE;
  }

  // Countable units (item, slice, wrap, can, portion, pack, …).
  const pricePerItem = PRICE_PER_ITEM[name] ?? PRICE_PER_100G[name] ?? DEFAULT_PRICE_PER_ITEM;
  return quantity * pricePerItem;
}

/**
 * Estimate a recipe's total cost (in £) from its ingredients using illustrative
 * grocery prices. Returns a value rounded to the nearest 5p, with a small floor
 * so a non-empty recipe never estimates to £0.00.
 */
export function estimateRecipeCost(ingredients: RecipeIngredient[]): number {
  if (ingredients.length === 0) return 0;

  const total = ingredients.reduce((sum, ingredient) => sum + estimateIngredientCost(ingredient), 0);
  const rounded = Math.round(total * 20) / 20;

  return Math.max(0.2, Number(rounded.toFixed(2)));
}
