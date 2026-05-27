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
  const [form, setForm] = useState({ name: "", minutes: 10, price: 2.5, ingredients: "", tags: "" });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      return;
    }

    const nextRecipe = {
      id: `custom-${Date.now()}`,
        name: form.name,
        type: "cook",
        mealSlots: ["lunch", "dinner"],
        time: +form.minutes,
        price: +form.price,
        ingredients: form.ingredients
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        tags: form.tags
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        allergens: [],
        nutrition: { calories: 500, protein: 20, carbs: 60, fat: 15 },
        rating: 0,
        reviews: [],
        instructions: ["Prepare the ingredients.", "Cook or assemble the meal.", "Taste and adjust seasoning."],
        source: "My recipes",
        note: "Added by you",
        image: "🍽️",
      } satisfies Meal;

    setCustomRecipes([nextRecipe, ...customRecipes]);
    track("custom_recipe_added", {
      meal_id: nextRecipe.id,
      minutes: nextRecipe.time,
      price: nextRecipe.price,
      ingredient_count: nextRecipe.ingredients.length,
      tag_count: nextRecipe.tags.length,
    });
    setForm({ name: "", minutes: 10, price: 2.5, ingredients: "", tags: "" });
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
              <Field label="Recipe name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Microwave bean burrito" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Time (mins)" type="number" value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes: +minutes })} />
                <Field label="Cost / portion (£)" type="number" step="0.05" value={form.price} onChange={(price) => setForm({ ...form, price: +price })} />
              </div>
              <Field label="Ingredients" value={form.ingredients} onChange={(ingredients) => setForm({ ...form, ingredients })} placeholder="beans, wrap, tomato" />
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
