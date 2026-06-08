import type { RecipeIngredient } from "./types";

const VOLUME_UNITS = new Set(["ml", "l", "tsp", "tbsp", "cup", "fl oz"]);
const MASS_UNITS = new Set(["g", "kg", "oz", "lb"]);

// Conversion factors to metric volume base (ml)
const TO_ML: Record<string, number> = { tsp: 4.929, tbsp: 14.787, cup: 236.588, l: 1000, "fl oz": 29.574 };
// Conversion factors to metric mass base (g)
const TO_G: Record<string, number> = { kg: 1000, oz: 28.35, lb: 453.592 };

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function metricVolumeDisplay(ml: number): { quantity: number; unit: string } {
  return ml >= 1000
    ? { quantity: round(ml / 1000, 2), unit: "l" }
    : { quantity: round(ml, 1), unit: "ml" };
}

function metricMassDisplay(g: number): { quantity: number; unit: string } {
  return g >= 1000
    ? { quantity: round(g / 1000, 2), unit: "kg" }
    : { quantity: round(g, 1), unit: "g" };
}

function imperialVolumeDisplay(floz: number): { quantity: number; unit: string } {
  return floz >= 8
    ? { quantity: round(floz / 8, 2), unit: "cup" }
    : { quantity: round(floz, 1), unit: "fl oz" };
}

function imperialMassDisplay(oz: number): { quantity: number; unit: string } {
  return oz >= 16
    ? { quantity: round(oz / 16, 2), unit: "lb" }
    : { quantity: round(oz, 1), unit: "oz" };
}

export function normalizeIngredientUnit(
  ingredient: RecipeIngredient,
  unitSystem: "metric" | "imperial",
): RecipeIngredient {
  const { unit, quantity } = ingredient;

  if (unitSystem === "metric") {
    if (unit === "ml" || unit === "l") {
      const ml = unit === "l" ? quantity * 1000 : quantity;
      const d = metricVolumeDisplay(ml);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
    if (TO_ML[unit] !== undefined) {
      const d = metricVolumeDisplay(quantity * TO_ML[unit]);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
    if (unit === "g" || unit === "kg") {
      const g = unit === "kg" ? quantity * 1000 : quantity;
      const d = metricMassDisplay(g);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
    if (TO_G[unit] !== undefined) {
      const d = metricMassDisplay(quantity * TO_G[unit]);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
  }

  if (unitSystem === "imperial") {
    if (VOLUME_UNITS.has(unit)) {
      const ml = unit === "ml" ? quantity : unit === "l" ? quantity * 1000 : quantity * (TO_ML[unit] ?? 1);
      const floz = ml * 0.033814; // ml → fl oz
      const d = imperialVolumeDisplay(floz);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
    if (MASS_UNITS.has(unit)) {
      const g = unit === "g" ? quantity : unit === "kg" ? quantity * 1000 : quantity * (TO_G[unit] ?? 1);
      const oz = g * 0.035274; // g → oz
      const d = imperialMassDisplay(oz);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
  }

  // Count / non-convertible unit — return unchanged
  return ingredient;
}
