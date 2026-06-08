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
    return `${quantity} ${ingredient.quantity === 1 ? ingredient.unit : `${ingredient.unit}s`}`;
  }

  return `${quantity} ${ingredient.quantity === 1 ? ingredient.unit : `${ingredient.unit}s`} ${preparation}${ingredient.name}`;
}

function pluraliseIngredientName(name: string) {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y")) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
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
