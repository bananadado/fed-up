import type { RecipeIngredient } from "./types";

const UNIT_ALIASES: Record<string, string> = {
  cups: "cup", cupss: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tablespoonss: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsps: "tsp", tbsps: "tbsp",
  gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l",
  ounce: "oz", ounces: "oz",
  pound: "lb", pounds: "lb", lbs: "lb",
  cloves: "clove",
  stalks: "stalk", heads: "head", bunches: "bunch",
  sprigs: "sprig", strips: "strip", pieces: "piece",
  florets: "floret", fillets: "fillet", rashers: "rasher",
  leaves: "leaf", loaves: "loaf",
  quart: "qt", quarts: "qt", qts: "qt",
  "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  "fl. oz": "fl oz", "fl. oz.": "fl oz",
  // Size descriptors used as units → treat as a single serving
  medium: "serving", large: "serving", small: "serving", whole: "serving",
};

function canonicalizeUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  const alias = UNIT_ALIASES[normalized];
  if (alias) return alias;

  // Recognise known measurement units even when a descriptor trails the unit
  // word (e.g. "cup boiling", "cups warm", "cup, divided"). These variants are
  // common for liquids like water in raw/recommender measures and would
  // otherwise fall through unconverted — showing as cups under both the g/ml
  // and oz/cup settings. Mirrors the ingest-side normalisation in
  // src/domain/ingredientMeasurements.ts. The leading prep-word case (e.g.
  // "cloves crushed") is already handled earlier by splitCompoundUnit.
  if (/\bfl\.?\s*oz\b/.test(normalized)) return "fl oz";
  if (/\b(cups?)\b/.test(normalized)) return "cup";
  if (/\b(tbsps?|tablespoons?)\b/.test(normalized)) return "tbsp";
  if (/\b(tsps?|teaspoons?)\b/.test(normalized)) return "tsp";
  if (/\b(qts?|quarts?)\b/.test(normalized)) return "qt";
  if (/^(millilitres?|milliliters?|ml)\b/.test(normalized)) return "ml";
  if (/^(litres?|liters?|l)\b/.test(normalized)) return "l";

  return normalized;
}

const VOLUME_UNITS = new Set(["ml", "l", "tsp", "tbsp", "cup", "fl oz", "qt"]);
const MASS_UNITS = new Set(["g", "kg", "oz", "lb"]);

// Conversion factors to metric volume base (ml)
const TO_ML: Record<string, number> = { tsp: 4.929, tbsp: 14.787, cup: 236.588, l: 1000, "fl oz": 29.574, qt: 946.353 };
// Conversion factors to metric mass base (g)
const TO_G: Record<string, number> = { kg: 1000, oz: 28.35, lb: 453.592, pinch: 0.3 };

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

function parseEmbeddedQty(s: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s.trim());
  if (mixed) {
    const [, w = "0", n = "0", d = "1"] = mixed;
    return Number(w) + (Number(d) ? Number(n) / Number(d) : 0);
  }
  const frac = /^(\d+)\/(\d+)$/.exec(s.trim());
  if (frac) {
    const [, n = "1", d = "1"] = frac;
    return Number(d) ? Number(n) / Number(d) : 1;
  }
  return Number(s) || 1;
}

const PREPARATION_WORDS = new Set([
  "crushed", "chopped", "minced", "diced", "sliced", "grated",
  "mashed", "pressed", "peeled", "fresh", "dried", "frozen",
  "cooked", "raw", "toasted", "roasted", "ground", "shredded",
]);

function splitCompoundUnit(ingredient: RecipeIngredient): RecipeIngredient {
  const parts = ingredient.unit.trim().split(/\s+/);
  if (parts.length <= 1) return ingredient;
  const [baseUnit = "", ...rest] = parts;
  if (!baseUnit || !PREPARATION_WORDS.has(rest[0]?.toLowerCase() ?? "")) return ingredient;
  return { ...ingredient, unit: baseUnit, preparation: ingredient.preparation || rest.join(" ") };
}

const EMBEDDED_PATTERN =
  /^(\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?)\s+(fl\s+oz|tbsp|tsp|cups?|ml|l|kg|g|lbs?|oz)\s+(.+)$/i;

function cleanEmbeddedIngredient(ingredient: RecipeIngredient): RecipeIngredient {
  if (!/^\d/.test(ingredient.name.trim())) return ingredient;
  const m = EMBEDDED_PATTERN.exec(ingredient.name.trim());
  if (!m) return ingredient;
  const [, qtyStr = "1", rawUnit = "", rawName = ""] = m;
  const qty = parseEmbeddedQty(qtyStr);
  const parsedName = rawName.trim().toLowerCase();
  if (!parsedName || !Number.isFinite(qty)) return ingredient;
  const unit = canonicalizeUnit(rawUnit);
  if (unit === "serving" || unit === "") return ingredient;
  const origUnit = canonicalizeUnit(ingredient.unit);
  const quantity =
    origUnit === "serving" || origUnit === "" ? ingredient.quantity * qty : qty;
  return { ...ingredient, name: parsedName, quantity, unit };
}

export function normalizeIngredientUnit(
  ingredient: RecipeIngredient,
  unitSystem: "metric" | "imperial",
): RecipeIngredient {
  const cleaned = cleanEmbeddedIngredient(ingredient);
  if (cleaned !== ingredient) {
    return normalizeIngredientUnit(cleaned, unitSystem);
  }

  const split = splitCompoundUnit(ingredient);
  if (split !== ingredient) {
    return normalizeIngredientUnit(split, unitSystem);
  }

  const { quantity } = ingredient;
  const unit = canonicalizeUnit(ingredient.unit);

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
      if (unit === "cup" || unit === "tsp" || unit === "tbsp" || unit === "fl oz" || unit === "qt") {
        return { ...ingredient, unit };
      }
      const ml = unit === "ml" ? quantity : quantity * 1000;
      const floz = ml * 0.033814;
      const d = imperialVolumeDisplay(floz);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
    if (MASS_UNITS.has(unit)) {
      if (unit === "oz" || unit === "lb") {
        return { ...ingredient, unit };
      }
      const g = unit === "g" ? quantity : quantity * 1000;
      const oz = g * 0.035274;
      const d = imperialMassDisplay(oz);
      return { ...ingredient, quantity: d.quantity, unit: d.unit };
    }
  }

  // Prep word used as unit (e.g. "sliced", "frozen") → move to preparation field, normalise to serving
  if (PREPARATION_WORDS.has(unit)) {
    const parts = [ingredient.preparation, unit].filter(Boolean);
    return normalizeIngredientUnit(
      { ...ingredient, unit: "serving", preparation: parts.join(", ") || undefined },
      unitSystem,
    );
  }

  // Count / non-convertible unit — return with canonicalized unit
  return unit !== ingredient.unit ? { ...ingredient, unit } : ingredient;
}
