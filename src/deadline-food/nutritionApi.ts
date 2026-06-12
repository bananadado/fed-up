import { deadlineFoodEndpointUrl } from "@/adapters/deadlineFoodApi";
import type { Nutrition, RecipeIngredient } from "./types";

export async function fetchOpenFoodFactsNutrition(ingredients: RecipeIngredient[]): Promise<Nutrition> {
  const response = await fetch(deadlineFoodEndpointUrl("nutrition"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? "Nutrition data could not be loaded.");
  }

  return await response.json() as Nutrition;
}
