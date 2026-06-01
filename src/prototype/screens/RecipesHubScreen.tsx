import { BookOpen, Plus, RefreshCcw, Sparkles, UtensilsCrossed } from "lucide-react";
import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Meal, NutritionSource, PlanEntry, Preferences } from "../types";
import { IngredientEditor } from "../components/IngredientEditor";
import { AppButton, Badge, Field } from "../components/primitives";
import {
  createIngredientDraft,
  formatIngredient,
  sanitiseIngredientDrafts,
  type IngredientDraft,
} from "../ingredients";
import { fetchOpenFoodFactsNutrition } from "../nutritionApi";
import { money, nutritionSourceSummary } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";
import { DiscoverScreen } from "./DiscoverScreen";

type Tab = "saved" | "discover" | "add";
type StateSetter<T> = Dispatch<SetStateAction<T>>;

type CreateForm = {
  name: string;
  minutes: number;
  totalCost: number;
  servings: number;
  ingredients: IngredientDraft[];
  tags: string;
  allergens: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutritionSource?: NutritionSource;
  instructions: string;
  note: string;
};

function createDefaultForm(): CreateForm {
  return {
    name: "",
    minutes: 10,
    totalCost: 5,
    servings: 2,
    ingredients: [createIngredientDraft()],
    tags: "",
    allergens: "",
    calories: 500,
    protein: 20,
    carbs: 60,
    fat: 15,
    nutritionSource: undefined,
    instructions: "",
    note: "",
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function RecipesHubScreen({
  customRecipes,
  setCustomRecipes,
  discoverSaved,
  setDiscoverSaved,
  discoverRejected,
  setDiscoverRejected,
  discoverReviewedRecipeIds,
  setDiscoverReviewedRecipeIds,
  plan,
  setPlan,
  prefs,
  onSelectMeal,
  track,
}: {
  customRecipes: Meal[];
  setCustomRecipes: StateSetter<Meal[]>;
  discoverSaved: Meal[];
  setDiscoverSaved: StateSetter<Meal[]>;
  discoverRejected: Meal[];
  setDiscoverRejected: StateSetter<Meal[]>;
  discoverReviewedRecipeIds: string[];
  setDiscoverReviewedRecipeIds: StateSetter<string[]>;
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  prefs: Preferences;
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const [tab, setTab] = useState<Tab>("saved");
  const [form, setForm] = useState<CreateForm>(() => createDefaultForm());
  const [attempted, setAttempted] = useState(false);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionStatus, setNutritionStatus] = useState<string | null>(null);

  const ingredients = sanitiseIngredientDrafts(form.ingredients);
  const servings = positiveNumber(Number(form.servings), 1);
  const totalCost = Math.max(0, Number(form.totalCost) || 0);
  const costPerPortion = totalCost / servings;
  const errors = {
    name: !form.name.trim(),
    ingredients: ingredients.length === 0,
    servings: Number(form.servings) < 1,
    totalCost: totalCost <= 0,
  };

  async function estimateNutrition() {
    if (ingredients.length === 0) {
      setAttempted(true);
      setNutritionStatus("Add at least one ingredient with a quantity first.");
      return;
    }

    setNutritionLoading(true);
    setNutritionStatus(null);

    try {
      const nutrition = await fetchOpenFoodFactsNutrition(ingredients);
      setForm((prev) => ({
        ...prev,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        nutritionSource: nutrition.source,
      }));
      const missing = nutrition.source?.missingIngredients ?? [];
      setNutritionStatus(missing.length > 0 ? `Couldn't find: ${missing.join(", ")}` : "All ingredients matched");
      track("recipe_nutrition_refreshed", {
        provider: nutrition.source?.provider,
        ingredient_count: ingredients.length,
        matched_count: nutrition.source?.matchedIngredients?.length ?? 0,
        missing_count: missing.length,
      });
    } catch (error) {
      setNutritionStatus(error instanceof Error ? error.message : "Nutrition data could not be loaded.");
    } finally {
      setNutritionLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (errors.name || errors.ingredients || errors.servings || errors.totalCost) {
      setAttempted(true);
      return;
    }

    const instructions = form.instructions
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const nextServings = Math.max(1, Math.round(servings));
    const nextTotalCost = Number(totalCost.toFixed(2));
    const nextPrice = Number((nextTotalCost / nextServings).toFixed(2));
    const nextRecipe = {
      id: `custom-${Date.now()}`,
      name: form.name.trim(),
      type: "cook",
      mealSlots: ["lunch", "dinner"],
      time: Math.max(0, Math.round(Number(form.minutes) || 0)),
      price: nextPrice,
      ingredients,
      tags: splitList(form.tags),
      allergens: splitList(form.allergens),
      nutrition: {
        calories: Math.max(0, Math.round(Number(form.calories) || 0)),
        protein: Math.max(0, Math.round(Number(form.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(form.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(form.fat) || 0)),
        source: form.nutritionSource,
      },
      rating: 0,
      reviews: [],
      instructions: instructions.length > 0
        ? instructions
        : ["Prepare the ingredients.", "Cook or assemble the meal.", "Taste and adjust seasoning."],
      source: "My recipes",
      note: form.note.trim() || `${nextServings} portions from about ${money(nextTotalCost)} total`,
      image: "🍽️",
      isUserCreated: true,
    } satisfies Meal;

    setCustomRecipes((recipes) => [nextRecipe, ...recipes]);
    track("custom_recipe_added", {
      meal_id: nextRecipe.id,
      minutes: nextRecipe.time,
      price: nextRecipe.price,
      total_cost: nextTotalCost,
      servings: nextServings,
      ingredient_count: nextRecipe.ingredients.length,
      tag_count: nextRecipe.tags.length,
    });
    setAttempted(false);
    setForm(createDefaultForm());
    setNutritionStatus(null);
    setTab("saved");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "saved", label: "Saved" },
    { id: "discover", label: "Discover" },
    { id: "add", label: "Add Recipe" },
  ];

  const allSaved = [...customRecipes, ...discoverSaved.filter((s) => !customRecipes.some((c) => c.id === s.id))];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <p className="mt-2 text-stone-600">Your saved recipes, new discoveries, and custom creations in one place.</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-stone-200">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => { track("recipes_tab_changed", { tab: id }); setTab(id); }}
            className={`rounded-t-lg px-5 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? "border-b-2 border-emerald-700 text-emerald-800"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "saved" && (
        <div>
          {allSaved.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white p-12 text-center">
              <UtensilsCrossed className="mx-auto mb-3 text-stone-300" size={40} />
              <p className="font-semibold text-stone-600">No saved recipes yet</p>
              <p className="mt-1 text-sm text-stone-400">Discover recipes to save them, or add your own.</p>
              <div className="mt-5 flex justify-center gap-3">
                <AppButton variant="secondary" onClick={() => setTab("discover")}>
                  <Sparkles size={15} /> Browse recipes
                </AppButton>
                <AppButton onClick={() => setTab("add")}>
                  <Plus size={15} /> Add your own
                </AppButton>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {allSaved.map((recipe) => {
                const isOwn = recipe.isUserCreated === true;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => onSelectMeal(recipe.id)}
                    className="rounded-xl border border-stone-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-3xl">{recipe.image}</span>
                      <Badge tone={isOwn ? "green" : "blue"}>{isOwn ? "Your recipe" : "Saved"}</Badge>
                    </div>
                    <p className="mt-2 break-words font-semibold leading-snug">{recipe.name}</p>
                    <p className="mt-1 text-sm font-medium text-emerald-700">{money(recipe.price)}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {recipe.time} min · {recipe.ingredients.map(formatIngredient).slice(0, 3).join(", ")}
                      {recipe.ingredients.length > 3 ? ` +${recipe.ingredients.length - 3}` : ""}
                    </p>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setTab("add")}
                className="flex min-h-[130px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-white text-sm font-medium text-stone-400 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                <Plus size={16} /> Add recipe
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "discover" && (
        <DiscoverScreen
          prefs={prefs}
          customRecipes={customRecipes}
          plan={plan}
          setPlan={setPlan}
          saved={discoverSaved}
          setSaved={setDiscoverSaved}
          rejected={discoverRejected}
          setRejected={setDiscoverRejected}
          reviewedRecipeIds={discoverReviewedRecipeIds}
          setReviewedRecipeIds={setDiscoverReviewedRecipeIds}
          onSelectMeal={onSelectMeal}
          track={track}
        />
      )}

      {tab === "add" && (
        <div>
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6">
            <div className="mb-5 flex items-center gap-2">
              <BookOpen size={18} className="text-emerald-700" />
              <h2 className="text-xl font-bold">New recipe</h2>
            </div>
            <form onSubmit={submit}>
              <div className="space-y-4">
                <Field label="Recipe name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Microwave bean burrito" error={attempted && errors.name} errorMessage="Please enter a recipe name" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Time (mins)" type="number" value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes: +minutes })} />
                  <Field label="Servings" type="number" value={form.servings} onChange={(servingsValue) => setForm({ ...form, servings: +servingsValue })} error={attempted && errors.servings} errorMessage="Must be at least 1" />
                </div>
                <Field label="Total recipe cost (£)" type="number" step="0.05" value={form.totalCost} onChange={(cost) => setForm({ ...form, totalCost: +cost })} error={attempted && errors.totalCost} errorMessage="Please enter a cost" />
                <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                  Estimated cost per portion: {money(costPerPortion)}
                </p>
                <div>
                  <IngredientEditor ingredients={form.ingredients} onChange={(nextIngredients) => setForm({ ...form, ingredients: nextIngredients })} />
                  {attempted && errors.ingredients && <p className="mt-2 text-xs font-medium text-red-600">Add at least one ingredient</p>}
                </div>
                <Field label="Tags" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="vegetarian, microwave" />
                <Field label="Allergens" value={form.allergens} onChange={(allergens) => setForm({ ...form, allergens })} placeholder="gluten, dairy" />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-3">
                  <div>
                    <p className="text-sm font-semibold">Nutrition data</p>
                    <p className="mt-1 text-xs text-stone-500">{nutritionStatus ?? nutritionSourceSummary(form.nutritionSource)}</p>
                  </div>
                  <AppButton type="button" variant="secondary" onClick={estimateNutrition} disabled={nutritionLoading}>
                    <RefreshCcw size={16} /> {nutritionLoading ? "Checking..." : "Pull from OpenFoodFacts"}
                  </AppButton>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Calories" type="number" value={form.calories} onChange={(calories) => setForm({ ...form, calories: +calories })} />
                  <Field label="Protein (g)" type="number" value={form.protein} onChange={(protein) => setForm({ ...form, protein: +protein })} />
                  <Field label="Carbs (g)" type="number" value={form.carbs} onChange={(carbs) => setForm({ ...form, carbs: +carbs })} />
                  <Field label="Fat (g)" type="number" value={form.fat} onChange={(fat) => setForm({ ...form, fat: +fat })} />
                </div>
                <label className="block">
                  <span className="text-sm font-semibold">Method</span>
                  <Textarea
                    value={form.instructions}
                    onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                    className="mt-2 min-h-36 rounded-lg border-stone-200 bg-white"
                    placeholder={"Step 1\nStep 2\nStep 3"}
                  />
                </label>
                <Field label="Notes" value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="Any tips or variations" />
              </div>
              <AppButton type="submit" className="mt-6 w-full">
                <Plus size={16} /> Add recipe
              </AppButton>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
