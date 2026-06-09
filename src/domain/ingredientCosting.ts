import type { MeasurableIngredient } from "./ingredientMeasurements";
import { gramsForIngredient, parseMeasureToIngredient } from "./ingredientMeasurements";
import {
  DEFAULT_PRICE_PENCE_PER_GRAM,
  ingredientPriceTable,
  type IngredientPriceRecord,
} from "./ingredientPrices";

export type IngredientCostEstimate = {
  ingredient: MeasurableIngredient;
  grams: number;
  pricePence: number;
  priceRecord?: IngredientPriceRecord;
  source: "price-table" | "fallback";
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ");
}

function allPriceKeys(record: IngredientPriceRecord): string[] {
  return [record.ingredient, ...record.aliases].map(normalizeName);
}

export function findIngredientPriceRecord(name: string): IngredientPriceRecord | undefined {
  const normalized = normalizeName(name);

  return ingredientPriceTable
    .filter((record) => allPriceKeys(record).some((key) => normalized === key || normalized.includes(key)))
    .sort((a, b) => {
      const aLongest = Math.max(...allPriceKeys(a).map((key) => key.length));
      const bLongest = Math.max(...allPriceKeys(b).map((key) => key.length));
      return bLongest - aLongest;
    })[0];
}

export function estimateIngredientCostPence(ingredient: MeasurableIngredient): IngredientCostEstimate {
  const grams = gramsForIngredient(ingredient);
  const priceRecord = findIngredientPriceRecord(ingredient.name);
  const pencePerGram = priceRecord?.pencePerGram ?? DEFAULT_PRICE_PENCE_PER_GRAM;

  return {
    ingredient,
    grams,
    pricePence: grams * pencePerGram,
    ...(priceRecord ? { priceRecord } : {}),
    source: priceRecord ? "price-table" : "fallback",
  };
}

export function roundPenceToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

export function estimateRecipeCostPence(ingredients: MeasurableIngredient[]): number {
  if (ingredients.length === 0) return 0;

  const total = ingredients.reduce((sum, ingredient) => {
    return sum + estimateIngredientCostPence(ingredient).pricePence;
  }, 0);

  return Math.max(20, roundPenceToNearestFive(total));
}

export function estimateRawMeasuresCostPence(
  ingredients: Array<{ name: string; measure: string }>,
): number {
  return estimateRecipeCostPence(
    ingredients.map(({ name, measure }) => parseMeasureToIngredient(name, measure)),
  );
}
