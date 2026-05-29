import type { RecipeIngredient } from "./types";

export function recipeIngredients(names: string[]): RecipeIngredient[] {
  return names.map(name => ({
    name,
    quantity: 1,
    unit: "serving",
  }));
}

export function ingredientName(ingredient: RecipeIngredient): string {
  return ingredient.name;
}

export function ingredientKey(ingredient: RecipeIngredient, index: number): string {
  return `${ingredient.name}:${ingredient.quantity}:${ingredient.unit}:${ingredient.preparation ?? ""}:${index}`;
}

export function formatIngredient(ingredient: RecipeIngredient): string {
  const quantity = Number.isInteger(ingredient.quantity) ? ingredient.quantity.toString() : ingredient.quantity.toFixed(1);
  const preparation = ingredient.preparation ? `${ingredient.preparation} ` : "";

  if (ingredient.unit === "serving") {
    return ingredient.quantity === 1
      ? `${preparation}${ingredient.name}`
      : `${quantity} servings ${preparation}${ingredient.name}`;
  }

  if (["g", "kg", "ml", "l"].includes(ingredient.unit)) {
    return `${quantity}${ingredient.unit} ${preparation}${ingredient.name}`;
  }

  if (ingredient.name.toLowerCase() === ingredient.unit) {
    return `${quantity} ${ingredient.quantity === 1 ? ingredient.unit : `${ingredient.unit}s`}`;
  }

  return `${quantity} ${ingredient.quantity === 1 ? ingredient.unit : `${ingredient.unit}s`} ${preparation}${ingredient.name}`;
}

export function ingredientNames(ingredients: RecipeIngredient[], limit?: number): string {
  return ingredients
    .slice(0, limit)
    .map(ingredientName)
    .join(", ");
}
