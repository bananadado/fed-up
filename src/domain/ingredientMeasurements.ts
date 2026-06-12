export type MeasurableIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

export type ParsedIngredientMeasure = MeasurableIngredient & {
  originalMeasure: string;
  preparation?: string;
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
  ["tsps", "tsp"],
  ["tablespoon", "tbsp"],
  ["tablespoons", "tbsp"],
  ["tablespoonful", "tbsp"],
  ["tablespoonfuls", "tbsp"],
  ["tbs", "tbsp"],
  ["tbsps", "tbsp"],
  ["tbls", "tbsp"],
  ["tblsp", "tbsp"],
  ["tblspn", "tbsp"],
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
  ["sprigs", "sprig"],
  ["sm", "small"],
  ["med", "medium"],
  ["lg", "large"],
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
  sprig: 1,
};
const DEFAULT_SERVING_GRAMS = 100;

const SIZE_UNIT_MULTIPLIER: Record<string, number> = {
  small: 0.7,
  medium: 1,
  large: 1.3,
};

export const typicalIngredientGrams: Record<string, number> = {
  apple: 150,
  avocado: 160,
  "bay leaf": 1,
  "bay leaves": 1,
  banana: 120,
  bread: 40,
  "bread slice": 40,
  cardamom: 0.3,
  "cardamom pod": 0.3,
  "cardamom pods": 0.3,
  "chicken stock cube": 10,
  "chicken stock cubes": 10,
  chilli: 10,
  chillies: 10,
  chili: 10,
  chilies: 10,
  "birds-eye chillies": 5,
  "bird eye chillies": 5,
  cinnamon: 5,
  "cinnamon stick": 5,
  "cinnamon sticks": 5,
  clove: 0.2,
  cloves: 0.2,
  egg: 58,
  eggs: 58,
  flatbread: 70,
  garlic: 5,
  "garlic clove": 5,
  "galangal slice": 5,
  "galangal slices": 5,
  "jacket potato": 250,
  "juniper berries": 0.2,
  "juniper berry": 0.2,
  lemon: 120,
  lemongrass: 40,
  "lemongrass stalk": 40,
  "lemongrass stalks": 40,
  lime: 80,
  "lime leaf": 0.125,
  "lime leaves": 0.125,
  "makrut lime leaf": 0.125,
  "makrut lime leaves": 0.125,
  "kaffir lime leaf": 0.125,
  "kaffir lime leaves": 0.125,
  "microwave rice": 250,
  onion: 110,
  onions: 110,
  "pandan leaf": 1,
  "pandan leaves": 1,
  pepper: 160,
  peppercorn: 0.1,
  peppercorns: 0.1,
  potato: 180,
  prawn: 20,
  prawns: 20,
  "king prawn": 20,
  "king prawns": 20,
  "raw king prawn": 20,
  "raw king prawns": 20,
  "rice portion": 180,
  shrimp: 20,
  shrimps: 20,
  shallot: 30,
  shallots: 30,
  squid: 150,
  "spring onion": 15,
  "spring onions": 15,
  "star anise": 1,
  tomato: 80,
  "tortilla wrap": 60,
  wrap: 60,
  "vine leaf": 4,
  "vine leaves": 4,
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// TheMealDB frequently writes amounts with Unicode vulgar fractions
// ("1 ½ tbsp", "½ cup"). Expand them to ASCII ("1 1/2", "1/2") so the numeric
// parsers below understand them instead of dropping the fraction and the unit.
const VULGAR_FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  "⅓": "1/3", "⅔": "2/3",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6",
  "⅐": "1/7", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
  "⅑": "1/9", "⅒": "1/10",
};
const VULGAR_FRACTION_CLASS = `[${Object.keys(VULGAR_FRACTIONS).join("")}]`;

export function expandVulgarFractions(value: string): string {
  return value
    // Split a whole number stuck to a fraction so "1½" matches "1 1/2".
    .replace(new RegExp(`(\\d)\\s*(${VULGAR_FRACTION_CLASS})`, "g"), "$1 $2")
    .replace(new RegExp(VULGAR_FRACTION_CLASS, "g"), (ch) => VULGAR_FRACTIONS[ch] ?? ch);
}

export function normalizeIngredientUnit(unit: string): string {
  const normalized = normalizeText(unit).replace(/\.$/, "");
  const alias = UNIT_ALIASES.get(normalized);
  if (alias) return alias;

  if (/^(g|gram|grams)\b/.test(normalized)) return "g";
  if (/^(kg|kilogram|kilograms)\b/.test(normalized)) return "kg";
  if (/^(ml|millilitre|millilitres|milliliter|milliliters)\b/.test(normalized)) return "ml";
  if (/^(l|litre|litres|liter|liters)\b/.test(normalized)) return "l";
  if (/\b(tblsp|tblspn|tablespoon|tablespoons|tbsp|tbsps|tbs)\b/.test(normalized)) return "tbsp";
  if (/\b(teaspoon|teaspoons|tsp|tsps)\b/.test(normalized)) return "tsp";
  if (/\b(cup|cups)\b/.test(normalized)) return "cup";
  if (/\b(sprig|sprigs)\b/.test(normalized)) return "sprig";

  return normalized;
}

// Preparation words that can trail (or stand in for) the unit in a measure,
// e.g. "3 chopped", "1 clove peeled crushed", "2 tbsp finely chopped". Kept in
// sync with the display-side vocab (src/deadline-food/unitConversion.ts and
// ingredients.ts) plus the common adverbs TheMealDB uses. Extracting these into
// a `preparation` field keeps the unit clean so the app renders "3 chopped
// scallions" rather than treating "chopped" as a unit ("3 servings chopped …").
const MEASURE_PREPARATION_WORDS = new Set([
  "chopped", "sliced", "diced", "grated", "minced", "mashed", "pressed",
  "peeled", "crushed", "beaten", "melted", "softened", "shredded", "cubed",
  "drained", "rinsed", "cooked", "raw", "toasted", "roasted", "fresh", "dried",
  "frozen", "tinned", "canned", "whole", "halved", "quartered", "trimmed",
  "deseeded", "seeded", "zested", "juiced", "boneless", "skinless",
  // adverbs that modify a following prep word
  "finely", "freshly", "roughly", "thinly", "coarsely", "lightly",
]);

/** Separate trailing/standalone preparation words from the unit portion of a
 *  measure. Returns the cleaned unit (defaulting to a count when only prep words
 *  remain) and the joined preparation, or null prep when there is none. */
function splitUnitAndPreparation(rawUnit: string): { unit: string; preparation?: string } {
  const tokens = rawUnit.split(/\s+/).filter(Boolean);
  const prepTokens = tokens.filter((t) => MEASURE_PREPARATION_WORDS.has(t));
  if (prepTokens.length === 0) {
    return { unit: normalizeIngredientUnit(rawUnit || "item") };
  }
  const unitTokens = tokens.filter((t) => !MEASURE_PREPARATION_WORDS.has(t));
  // No real unit left (e.g. "3 chopped") → it's a count of whole items.
  const unit = unitTokens.length > 0 ? normalizeIngredientUnit(unitTokens.join(" ")) : "item";
  return { unit, preparation: prepTokens.join(" ") };
}

export function parseQuantity(raw: string): number {
  const trimmed = expandVulgarFractions(raw.trim());
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

  const sizeMultiplier = SIZE_UNIT_MULTIPLIER[normalizedUnit];
  if (sizeMultiplier !== undefined) {
    return safeQuantity * (typicalGramsForIngredient(ingredientName) ?? DEFAULT_SERVING_GRAMS) * sizeMultiplier;
  }

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
  const normalizedMeasure = expandVulgarFractions(normalizeText(measure));
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

  // Order matters: try mixed numbers ("1 1/2") and bare fractions ("1/2")
  // before a plain integer/decimal. Otherwise the leading "\d+" branch matches
  // just the "1" of "1/2 cup", swallowing the "/2" and the unit — turning
  // "1/2 cup" into "1 item" instead of "0.5 cup".
  const match = normalizedMeasure.match(
    /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*([a-z. ]+)?/,
  );

  if (!match) {
    return { name, quantity: 1, unit: "serving", originalMeasure: measure };
  }

  const quantity = parseQuantity(match[1] ?? "1");
  const rawUnit = (match[2] ?? "").trim();
  const { unit, preparation } = splitUnitAndPreparation(rawUnit);

  return {
    name,
    quantity,
    unit,
    originalMeasure: measure,
    ...(preparation ? { preparation } : {}),
  };
}
