export type MeasurableIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

export type ParsedIngredientMeasure = MeasurableIngredient & {
  originalMeasure: string;
};

const GRAMS_PER_OUNCE = 28.3495;
const GRAMS_PER_POUND = 453.592;
const GRAMS_PER_UK_PINT = 568.261;

const UNIT_ALIASES = new Map<string, string>([
  ["gram", "g"],
  ["grams", "g"],
  ["kilogram", "kg"],
  ["kilograms", "kg"],
  ["millilitre", "ml"],
  ["millilitres", "ml"],
  ["milliliter", "ml"],
  ["milliliters", "ml"],
  ["litre", "l"],
  ["litres", "l"],
  ["liter", "l"],
  ["liters", "l"],
  ["teaspoon", "tsp"],
  ["teaspoons", "tsp"],
  ["tablespoon", "tbsp"],
  ["tablespoons", "tbsp"],
  ["tbs", "tbsp"],
  ["tbsps", "tbsp"],
  ["cups", "cup"],
  ["ounce", "oz"],
  ["ounces", "oz"],
  ["pound", "lb"],
  ["pounds", "lb"],
  ["lbs", "lb"],
  ["pints", "pint"],
  ["items", "item"],
  ["slices", "slice"],
  ["wraps", "wrap"],
  ["cans", "can"],
  ["tins", "tin"],
  ["packs", "pack"],
  ["packets", "pack"],
  ["portions", "portion"],
  ["servings", "serving"],
  ["pinches", "pinch"],
]);

const WEIGHT_OR_VOLUME_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  oz: GRAMS_PER_OUNCE,
  lb: GRAMS_PER_POUND,
  tsp: 5,
  tbsp: 15,
  cup: 240,
  pint: GRAMS_PER_UK_PINT,
};

const COUNT_UNIT_DEFAULT_GRAMS: Record<string, number> = {
  item: 100,
  slice: 30,
  wrap: 60,
  can: 400,
  tin: 400,
  pack: 150,
  portion: 100,
  serving: 100,
  pinch: 1,
};
const DEFAULT_SERVING_GRAMS = 100;

export const typicalIngredientGrams: Record<string, number> = {
  apple: 150,
  avocado: 160,
  banana: 120,
  bread: 40,
  "bread slice": 40,
  egg: 58,
  eggs: 58,
  flatbread: 70,
  garlic: 5,
  "garlic clove": 5,
  "jacket potato": 250,
  lemon: 120,
  lime: 80,
  "microwave rice": 250,
  pepper: 160,
  potato: 180,
  "rice portion": 180,
  tomato: 80,
  "tortilla wrap": 60,
  wrap: 60,
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeIngredientUnit(unit: string): string {
  const normalized = normalizeText(unit).replace(/\.$/, "");
  return UNIT_ALIASES.get(normalized) ?? normalized;
}

export function parseQuantity(raw: string): number {
  const trimmed = raw.trim();
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    return denominator > 0 ? whole + numerator / denominator : whole;
  }

  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator > 0 ? numerator / denominator : 1;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function typicalGramsForIngredient(name: string): number | undefined {
  const normalized = normalizeText(name);
  const direct = typicalIngredientGrams[normalized];
  if (direct !== undefined) return direct;

  const match = Object.entries(typicalIngredientGrams)
    .filter(([key]) => normalized.includes(key))
    .sort((a, b) => b[0].length - a[0].length)[0];

  return match?.[1];
}

export function gramsForIngredientUnit(
  ingredientName: string,
  quantity: number,
  unit: string,
): number {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (safeQuantity === 0) return 0;

  const normalizedUnit = normalizeIngredientUnit(unit);
  const gramsPerUnit = WEIGHT_OR_VOLUME_GRAMS[normalizedUnit];
  if (gramsPerUnit !== undefined) return safeQuantity * gramsPerUnit;

  if (normalizedUnit === "slice" && normalizeText(ingredientName).includes("bread")) {
    return safeQuantity * (typicalIngredientGrams.bread ?? 40);
  }

  const countDefault = COUNT_UNIT_DEFAULT_GRAMS[normalizedUnit];
  if (countDefault !== undefined) {
    if (normalizedUnit === "pinch") return safeQuantity * countDefault;
    return safeQuantity * (typicalGramsForIngredient(ingredientName) ?? countDefault);
  }

  return safeQuantity * (typicalGramsForIngredient(ingredientName) ?? DEFAULT_SERVING_GRAMS);
}

export function gramsForIngredient(ingredient: MeasurableIngredient): number {
  return gramsForIngredientUnit(ingredient.name, ingredient.quantity, ingredient.unit);
}

export function parseMeasureToIngredient(name: string, measure: string): ParsedIngredientMeasure {
  const normalizedMeasure = normalizeText(measure);
  if (
    !normalizedMeasure ||
    normalizedMeasure === "to taste" ||
    normalizedMeasure === "dash" ||
    normalizedMeasure === "sprig"
  ) {
    return { name, quantity: 1, unit: "pinch", originalMeasure: measure };
  }

  if (normalizedMeasure === "pinch" || normalizedMeasure === "a pinch") {
    return { name, quantity: 1, unit: "pinch", originalMeasure: measure };
  }

  const match = normalizedMeasure.match(
    /^(\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*([a-z. ]+)?/,
  );

  if (!match) {
    return { name, quantity: 1, unit: "serving", originalMeasure: measure };
  }

  const quantity = parseQuantity(match[1] ?? "1");
  const rawUnit = (match[2] ?? "").trim();
  const normalizedUnit = normalizeIngredientUnit(rawUnit || "item");

  if (normalizedUnit === "medium" || normalizedUnit === "large" || normalizedUnit === "small") {
    return { name, quantity, unit: "item", originalMeasure: measure };
  }

  return {
    name,
    quantity,
    unit: normalizedUnit,
    originalMeasure: measure,
  };
}
