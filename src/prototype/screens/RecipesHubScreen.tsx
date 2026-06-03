import { Plus, Sparkles, UtensilsCrossed } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";

import type { Deadline, Meal, PlanEntry, Preferences } from "../types";
import { RecipeEditor, type RecipeEditorOutput } from "../components/RecipeEditor";
import { AppButton, Badge } from "../components/primitives";
import { formatIngredient } from "../ingredients";
import { money } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";
import { DiscoverScreen } from "./DiscoverScreen";
import { createRecommenderRecipe } from "../recommenderApi";

type Tab = "saved" | "discover" | "add";
type StateSetter<T> = Dispatch<SetStateAction<T>>;

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
  deadlines,
  sessionId,
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
  deadlines: Deadline[];
  sessionId: string;
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const [tab, setTab] = useState<Tab>("saved");

  function handleCreateRecipe(output: RecipeEditorOutput, photoUrl: string | undefined) {
    const instructions =
      output.instructions.length > 0
        ? output.instructions
        : ["Prepare the ingredients.", "Cook or assemble the meal.", "Taste and adjust seasoning."];

    const nextRecipe: Meal = {
      id: `custom-${Date.now()}`,
      name: output.name,
      type: "cook",
      mealSlots: output.mealSlots,
      time: output.time,
      price: output.price,
      ingredients: output.ingredients,
      tags: output.tags,
      allergens: output.allergens,
      nutrition: output.nutrition,
      rating: 0,
      reviews: [],
      instructions,
      source: "My recipes",
      note: output.note || `${output.servings} portions from about ${money(output.totalCost)} total`,
      image: "🍽️",
      ...(photoUrl ? { photoUrl } : {}),
      isUserCreated: true,
    };

    setCustomRecipes((recipes) => [nextRecipe, ...recipes]);
    // Embed the recipe on the recommender immediately on creation.
    createRecommenderRecipe(nextRecipe).catch((error) => {
      console.warn("Recipe could not be embedded on the recommender.", error);
    });
    track("custom_recipe_added", {
      meal_id: nextRecipe.id,
      minutes: nextRecipe.time,
      price: nextRecipe.price,
      total_cost: output.totalCost,
      servings: output.servings,
      ingredient_count: nextRecipe.ingredients.length,
      tag_count: nextRecipe.tags.length,
    });
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
                      {recipe.photoUrl ? (
                        <img src={recipe.photoUrl} alt={recipe.name} className="h-12 w-12 rounded-md object-cover" />
                      ) : (
                        <span className="text-3xl">{recipe.image}</span>
                      )}
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
          deadlines={deadlines}
          sessionId={sessionId}
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
        <RecipeEditor
          mode="create"
          title="New recipe"
          onSubmit={handleCreateRecipe}
          track={track}
        />
      )}
    </div>
  );
}
