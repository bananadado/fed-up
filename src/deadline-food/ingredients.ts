import type { RecipeIngredient } from "./types";

const numberPattern = /^(?<quantity>\d+\s+\d+\/\d+|\d+(?:\.\d+)?|\d+\/\d+)\s*(?<unit>g|kg|ml|l|tbsp|tsp|cup|cups|slice|slices|wrap|wraps|item|items|can|cans|portion|portions|pack|packs)?\s+(?<name>.+)$/i;

export const ingredientUnits = [
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "slice",
  "wrap",
  "item",
  "can",
  "portion",
  "pack",
  "serving",
] as const;

export const ingredientPreparations = [
  "chopped",
  "sliced",
  "diced",
  "grated",
  "minced",
  "cooked",
  "raw",
  "frozen",
  "tinned",
  "canned",
  "drained",
  "rinsed",
] as const;

export const ingredientOptions = [
  "apple",
  "banana",
  "baked beans",
  "bean filling",
  "berries",
  "black pepper",
  "bread",
  "broccoli",
  "carrot",
  "chicken",
  "chicken pieces",
  "couscous",
  "cucumber",
  "egg",
  "edamame",
  "flatbread",
  "grain salad",
  "hummus",
  "jacket potato",
  "lemon juice",
  "lettuce",
  "lime",
  "microwave rice",
  "mixed beans",
  "mixed vegetables",
  "noodles",
  "oat milk",
  "oats",
  "peanut butter",
  "peas",
  "pepper",
  "potato",
  "rice",
  "salad leaves",
  "smoked paprika",
  "soy sauce",
  "spinach",
  "spring onion",
  "sweetcorn",
  "tomato",
  "tomato salsa",
  "tortilla wrap",
  "tuna",
  "vegetable sushi",
  "yoghurt dressing",
] as const;

// Approximate grams per single countable unit for common ingredients.
// Only covers ingredients where a count-based quantity is natural for shopping.
export const ITEM_WEIGHT_G: Record<string, number> = {
  apple: 182,
  aubergine: 250,
  avocado: 200,
  banana: 118,
  broccoli: 350,
  cabbage: 900,
  carrot: 80,
  courgette: 196,
  cucumber: 300,
  egg: 58,
  flatbread: 60,
  "jacket potato": 400,
  leek: 150,
  lemon: 84,
  lime: 67,
  mushroom: 20,
  onion: 110,
  orange: 131,
  pepper: 160,
  potato: 213,
  "spring onion": 15,
  "sweet potato": 130,
  tomato: 123,
  "tortilla wrap": 45,
};

export type IngredientDraft = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  preparation: string;
};

const singularUnits = new Map([
  ["cups", "cup"],
  ["slices", "slice"],
  ["wraps", "wrap"],
  ["items", "item"],
  ["cans", "can"],
  ["portions", "portion"],
  ["packs", "pack"],
]);
const countableUnits = new Set(["slice", "wrap", "item", "can", "portion", "pack"]);
const preparationLookup = new Set<string>(ingredientPreparations);
const preparationAliases = new Map([
  ["chop", "chopped"],
  ["slice", "sliced"],
  ["dice", "diced"],
  ["grate", "grated"],
  ["mince", "minced"],
  ["tin", "tinned"],
  ["can", "canned"],
]);
const ingredientAliases = new Map([
  ["beans", "mixed beans"],
  ["berry", "berries"],
  ["chopped tomatoes", "tomato"],
  ["courgette", "courgette"],
  ["eggs", "egg"],
  ["frozen greens", "spinach"],
  ["frozen peas", "peas"],
  ["frozen peppers", "pepper"],
  ["halal chicken", "chicken"],
  ["halal chicken pieces", "chicken pieces"],
  ["lettuce leaves", "lettuce"],
  ["peppers", "pepper"],
  ["rice portion", "rice"],
  ["tomatoes", "tomato"],
  ["wrap", "tortilla wrap"],
  ["wraps", "tortilla wrap"],
]);

function parseQuantity(value: string) {
  const mixedMatch = /^(\d+)\s+(\d+)\/(\d+)$/.exec(value.trim());
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    return den ? whole + num / den : whole;
  }
  if (value.includes("/")) {
    const [numerator = 1, denominator = 1] = value.split("/").map(Number);
    return denominator ? numerator / denominator : 1;
  }

  return Number(value) || 1;
}

function normaliseUnit(value: string | undefined) {
  const unit = value?.toLowerCase() ?? "serving";
  return singularUnits.get(unit) ?? unit;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalisePreparation(value: string | undefined) {
  const preparation = value?.trim().toLowerCase() ?? "";

  if (!preparation) return "";

  return preparationAliases.get(preparation) ?? preparation;
}

function splitPreparationFromName(value: string) {
  const words = value.trim().toLowerCase().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const preparations: string[] = [];

  while (words[0]) {
    const preparation = normalisePreparation(words[0]);

    if (!preparationLookup.has(preparation as (typeof ingredientPreparations)[number])) {
      break;
    }

    preparations.push(preparation);
    words.shift();
  }

  return {
    name: words.join(" "),
    preparation: preparations.join(", "),
  };
}

export function normaliseIngredientName(value: string) {
  const stripped = value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");
  const { name } = splitPreparationFromName(stripped);
  const aliased = ingredientAliases.get(name) ?? name;

  return ingredientAliases.get(aliased) ?? aliased;
}

export function sanitiseIngredientQuantity(value: string | number) {
  const raw = String(value).trim().replace(",", ".");
  const parsed = parseQuantity(raw || "1");
  const quantity = Number.isFinite(parsed) ? parsed : 1;

  return Number(clamp(quantity, 0.1, 5000).toFixed(2));
}

export function formatQuantityForInput(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
}

export function createIngredientDraft(overrides: Partial<IngredientDraft> = {}): IngredientDraft {
  return {
    id: overrides.id ?? `ingredient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? "",
    quantity: overrides.quantity ?? "100",
    unit: overrides.unit ?? "g",
    preparation: overrides.preparation ?? "",
  };
}

export function ingredientToDraft(ingredient: RecipeIngredient, index = 0): IngredientDraft {
  return createIngredientDraft({
    id: `ingredient-${index}-${ingredient.name}`,
    name: ingredient.name,
    quantity: formatQuantityForInput(ingredient.quantity),
    unit: ingredient.unit,
    preparation: ingredient.preparation ?? "",
  });
}

export function ingredientDraftsFromIngredients(ingredients: RecipeIngredient[], emptyFallback = true) {
  return ingredients.length > 0 || !emptyFallback ? ingredients.map(ingredientToDraft) : [createIngredientDraft()];
}

export function sanitiseIngredientDraft(draft: IngredientDraft): RecipeIngredient | null {
  const split = splitPreparationFromName(draft.name);
  const name = normaliseIngredientName(split.name || draft.name);
  const unit = normaliseUnit(draft.unit);
  const preparation = [
    normalisePreparation(draft.preparation),
    split.preparation,
  ].filter(Boolean).join(", ");

  if (!name) return null;

  return {
    name,
    quantity: sanitiseIngredientQuantity(draft.quantity),
    unit,
    ...(preparation ? { preparation } : {}),
  };
}

export function sanitiseIngredientDrafts(drafts: IngredientDraft[]) {
  const ingredients = drafts
    .map(sanitiseIngredientDraft)
    .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null);

  return ingredients.filter((ingredient, index) => {
    const duplicateIndex = ingredients.findIndex((candidate) =>
      candidate.name === ingredient.name &&
      candidate.unit === ingredient.unit &&
      candidate.preparation === ingredient.preparation
    );

    return duplicateIndex === index;
  });
}

export function scaleIngredient(ingredient: RecipeIngredient, factor: number): RecipeIngredient {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;

  return {
    ...ingredient,
    quantity: sanitiseIngredientQuantity(ingredient.quantity * safeFactor),
  };
}

export function scaleIngredients(ingredients: RecipeIngredient[], factor: number): RecipeIngredient[] {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return ingredients;
  }

  return ingredients.map((ingredient) => scaleIngredient(ingredient, factor));
}

export function ingredientName(ingredient: RecipeIngredient | string) {
  return typeof ingredient === "string" ? ingredient : ingredient.name;
}

export function ingredientSearchTerm(ingredient: RecipeIngredient | string) {
  return ingredientName(ingredient).trim();
}

export function formatIngredient(ingredient: RecipeIngredient | string) {
  if (typeof ingredient === "string") {
    return ingredient;
  }

  const quantity = Number.isInteger(ingredient.quantity) ? ingredient.quantity.toString() : ingredient.quantity.toFixed(1);
  const preparation = ingredient.preparation ? `${ingredient.preparation} ` : "";

  if (ingredient.unit === "serving") {
    return ingredient.quantity === 1 ? `${preparation}${ingredient.name}` : `${quantity} servings ${preparation}${ingredient.name}`;
  }

  if (["g", "kg", "ml", "l", "oz", "lb", "fl oz"].includes(ingredient.unit)) {
    return `${quantity}${ingredient.unit} ${preparation}${ingredient.name}`;
  }

  if (ingredient.unit === "item") {
    const name = ingredient.quantity === 1 ? ingredient.name : pluraliseIngredientName(ingredient.name);
    return `${quantity} ${preparation}${name}`;
  }

  if (ingredient.name.toLowerCase() === ingredient.unit) {
    return `${quantity} ${pluraliseUnit(ingredient.unit, ingredient.quantity)}`;
  }

  return `${quantity} ${pluraliseUnit(ingredient.unit, ingredient.quantity)} ${preparation}${ingredient.name}`;
}

// Mass/uncountable food nouns that read wrong when pluralised or counted
// ("4 bacons", "2 oils"). Matched on the head (last) noun so "plain flour" and
// "olive oil" are covered. Deliberately excludes whole vegetables that ARE
// countable (cabbage, broccoli, …) so "2 cabbages" still reads naturally.
const UNCOUNTABLE_INGREDIENT_NAMES = new Set([
  "bacon", "beef", "pork", "lamb", "mince", "fish", "tuna", "salmon", "ham",
  "rice", "pasta", "couscous", "quinoa", "bread", "flour", "cornflour",
  "cornstarch", "sugar", "salt", "pepper", "butter", "oil", "ghee", "water",
  "milk", "cream", "cheese", "yoghurt", "yogurt", "honey", "syrup", "jam",
  "garlic", "ginger", "spinach", "hummus", "tofu", "mayonnaise", "ketchup",
  "mustard", "stock", "broth", "wine", "vinegar", "oats", "cocoa", "chocolate",
]);

// Irregular plurals that simple "+s" rules get wrong ("bay leafs" → "leaves").
const IRREGULAR_PLURALS: Record<string, string> = {
  leaf: "leaves", loaf: "loaves", half: "halves", knife: "knives",
  potato: "potatoes", tomato: "tomatoes", chilli: "chillies", chili: "chilies",
};

// Approximate density (grams per millilitre) for ingredients commonly measured
// by both volume and weight, so the shopping list can merge e.g. "590g flour"
// with "2.7l flour". Matched on the head noun.
export const INGREDIENT_DENSITY_G_PER_ML: Record<string, number> = {
  flour: 0.53, cornflour: 0.54, cornstarch: 0.54, sugar: 0.85, oil: 0.92,
  ghee: 0.91, butter: 0.91, honey: 1.42, syrup: 1.37, milk: 1.03, water: 1.0,
  cream: 1.01, yoghurt: 1.03, yogurt: 1.03, rice: 0.85, salt: 1.2, oats: 0.41,
  cocoa: 0.52, breadcrumbs: 0.4,
};

// Measurement-unit abbreviations are invariant: "2 tbsp", not "2 tbsps".
const INVARIANT_UNITS = new Set(["tbsp", "tsp", "g", "kg", "ml", "l", "oz", "lb", "fl oz"]);

function headNoun(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).toLowerCase();
}

/** True for mass/uncountable foods that should not be pluralised or shown with
 *  a whole-item count (flour, oil, garlic, …). */
export function isUncountableFood(name: string): boolean {
  return UNCOUNTABLE_INGREDIENT_NAMES.has(headNoun(name));
}

/** Pluralise an ingredient's head noun, respecting uncountable and irregular
 *  forms. "bay leaf" → "bay leaves", "berry" → "berries", "oil" → "oil". */
export function pluraliseFoodName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (!last) return name;
  const head = last.toLowerCase();
  let plural: string;
  if (UNCOUNTABLE_INGREDIENT_NAMES.has(head)) plural = head;
  else if (IRREGULAR_PLURALS[head]) plural = IRREGULAR_PLURALS[head]!;
  else if (head.endsWith("s") || head.endsWith("ss")) plural = head;
  else if (head.endsWith("y") && !/[aeiou]y$/.test(head)) plural = `${head.slice(0, -1)}ies`;
  else if (/(ch|sh|x|z)$/.test(head)) plural = `${head}es`;
  else if (head.endsWith("fe")) plural = `${head.slice(0, -2)}ves`;
  else if (head.endsWith("f")) plural = `${head.slice(0, -1)}ves`;
  else plural = `${head}s`;
  // Preserve the original casing of the first letter.
  parts[parts.length - 1] = /^[A-Z]/.test(last) ? plural.charAt(0).toUpperCase() + plural.slice(1) : plural;
  return parts.join(" ");
}

function pluraliseIngredientName(name: string) {
  return pluraliseFoodName(name);
}

function pluraliseUnit(unit: string, quantity: number): string {
  if (quantity === 1) return unit;
  if (INVARIANT_UNITS.has(unit)) return unit;
  if (unit.endsWith("s")) return unit;
  if (unit.endsWith("ch") || unit.endsWith("sh")) return `${unit}es`;
  return `${unit}s`;
}

export function parseIngredients(value: string): RecipeIngredient[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(numberPattern);

      if (!match?.groups) {
        const split = splitPreparationFromName(item);

        return {
          name: normaliseIngredientName(split.name || item),
          quantity: 1,
          unit: "serving",
          ...(split.preparation ? { preparation: split.preparation } : {}),
        };
      }

      let name = match.groups.name?.trim() ?? item;
      const quantity = match.groups.quantity ?? "1";
      let unit = normaliseUnit(match.groups.unit);

      if (!match.groups.unit && countableUnits.has(normaliseUnit(name))) {
        unit = normaliseUnit(name);
        name = unit;
      }

      const split = splitPreparationFromName(name);
      name = normaliseIngredientName(split.name || name);

      return {
        name,
        quantity: sanitiseIngredientQuantity(quantity),
        unit,
        ...(split.preparation ? { preparation: split.preparation } : {}),
      };
    });
}

export function formatIngredientsForEditing(ingredients: RecipeIngredient[]) {
  return ingredients.map(formatIngredient).join(", ");
}
