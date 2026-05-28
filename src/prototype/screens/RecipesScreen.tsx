import { Plus, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import type { Meal } from "../types";
import { AppButton, Field } from "../components/primitives";
import { money } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";

export function RecipesScreen({
  customRecipes,
  setCustomRecipes,
  onSelectMeal,
  track,
}: {
  customRecipes: Meal[];
  setCustomRecipes: (recipes: Meal[]) => void;
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const [form, setForm] = useState({ name: "", minutes: 10, totalCost: 5, servings: 2, ingredients: "", tags: "", steps: "" });
  const [attempted, setAttempted] = useState(false);
  const costPerPortion = Math.max(0, +form.totalCost) / Math.max(1, +form.servings);

  const errors = {
    name: !form.name.trim(),
    ingredients: form.ingredients.split(",").map((v) => v.trim()).filter(Boolean).length === 0,
    servings: +form.servings < 1,
    totalCost: +form.totalCost <= 0,
  };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const ingredients = form.ingredients
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const instructions = form.steps
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    if (errors.name || errors.ingredients || errors.servings || errors.totalCost) {
      setAttempted(true);
      return;
    }

    const nextRecipe = {
      id: `custom-${Date.now()}`,
        name: form.name,
        type: "cook",
        mealSlots: ["lunch", "dinner"],
        time: +form.minutes,
        price: costPerPortion,
        ingredients,
        tags: form.tags
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        allergens: [],
        nutrition: { calories: 500, protein: 20, carbs: 60, fat: 15 },
        rating: 0,
        reviews: [],
        instructions: instructions.length ? instructions : ["Prepare the ingredients.", "Cook or assemble the meal.", "Taste and adjust seasoning."],
        source: "My recipes",
        note: `${form.servings} portions from about ${money(+form.totalCost)} total`,
        image: "🍽️",
      } satisfies Meal;

    setCustomRecipes([nextRecipe, ...customRecipes]);
    track("custom_recipe_added", {
      meal_id: nextRecipe.id,
      minutes: nextRecipe.time,
      price: nextRecipe.price,
      total_cost: +form.totalCost,
      servings: +form.servings,
      ingredient_count: nextRecipe.ingredients.length,
      tag_count: nextRecipe.tags.length,
    });
    setAttempted(false);
    setForm({ name: "", minutes: 10, totalCost: 5, servings: 2, ingredients: "", tags: "", steps: "" });
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-3xl font-bold">My recipes</h1>
        <p className="mt-2 text-stone-600">Add quick meals Autopilot can use in future plans.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[430px_1fr]">
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6">
          <form onSubmit={submit}>
            <h2 className="text-xl font-bold">New recipe</h2>
            <div className="mt-5 space-y-4">
              <Field label="Recipe name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Microwave bean burrito" error={attempted && errors.name} errorMessage="Please enter a recipe name" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Time (mins)" type="number" value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes: +minutes })} />
                <Field label="Servings" type="number" value={form.servings} onChange={(servings) => setForm({ ...form, servings: +servings })} error={attempted && errors.servings} errorMessage="Must be at least 1" />
              </div>
              <Field label="Total recipe cost (£)" type="number" step="0.05" value={form.totalCost} onChange={(totalCost) => setForm({ ...form, totalCost: +totalCost })} error={attempted && errors.totalCost} errorMessage="Please enter a cost" />
              <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Estimated cost per portion: {money(costPerPortion)}</p>
              <Field label="Ingredients" value={form.ingredients} onChange={(ingredients) => setForm({ ...form, ingredients })} placeholder="beans, wrap, tomato" error={attempted && errors.ingredients} errorMessage="Add at least one ingredient" />
              <label className="block">
                <span className="text-sm font-semibold">Steps</span>
                <textarea value={form.steps} onChange={(event) => setForm({ ...form, steps: event.target.value })} placeholder="One step per line" className="mt-2 min-h-28 w-full rounded-lg border border-stone-200 bg-white p-3 text-sm placeholder:text-muted-foreground focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/20" />
              </label>
              <Field label="Tags" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="vegetarian, microwave" />
            </div>
            <AppButton type="submit" className="mt-6 w-full">
              <Plus size={16} /> Add recipe
            </AppButton>
          </form>
        </Card>
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-5">
          <h2 className="font-bold">Saved recipes</h2>
          <div className="mt-4 space-y-3">
            {customRecipes.length === 0 ? (
              <div className="rounded-lg bg-stone-50 p-8 text-center text-stone-500">
                <UtensilsCrossed className="mx-auto mb-3" />
                Your own quick recipes appear here.
              </div>
            ) : (
              customRecipes.map((recipe) => (
                <button key={recipe.id} type="button" onClick={() => onSelectMeal(recipe.id)} className="w-full rounded-lg bg-stone-50 p-4 text-left transition hover:bg-emerald-50">
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">
                      {recipe.image} {recipe.name}
                    </p>
                    <p className="font-medium text-emerald-700">{money(recipe.price)}</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-500">
                    {recipe.time} minutes - {recipe.ingredients.join(", ")}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
