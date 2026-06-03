import { Plus, RotateCcw, Sparkles, UtensilsCrossed } from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { Deadline, DiscoverRecommendationState, Meal, Preferences } from "../types";
import { RecipeEditor, type RecipeEditorOutput } from "../components/RecipeEditor";
import { AppButton, Badge } from "../components/primitives";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { formatIngredient } from "../ingredients";
import { money } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";
import { DiscoverScreen } from "./DiscoverScreen";
import { createRecommenderRecipe, deleteRecommenderRecipe } from "../recommenderApi";

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
  discoverRecommendationState,
  setDiscoverRecommendationState,
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
  discoverRecommendationState: DiscoverRecommendationState;
  setDiscoverRecommendationState: StateSetter<DiscoverRecommendationState>;
  prefs: Preferences;
  deadlines: Deadline[];
  sessionId: string;
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const stored = sessionStorage.getItem("deadlineFood:recipesTab");
      if (stored === "discover" || stored === "saved" || stored === "add") return stored;
    } catch { /* ignore */ }
    return "saved";
  });
  const [savedSortBy, setSavedSortBy] = useState<"default" | "time" | "price" | "health">("default");
  const [savedTagFilter, setSavedTagFilter] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ recipeId: string; isOwn: boolean } | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem("deadlineFood:recipesTab", tab); } catch { /* ignore */ }
  }, [tab]);

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

  function handleRestorePassed(recipe: Meal) {
    setDiscoverRejected((recipes) => recipes.filter((item) => item.id !== recipe.id));
    setDiscoverSaved((recipes) => (recipes.some((item) => item.id === recipe.id) ? recipes : [...recipes, recipe]));
    setDiscoverReviewedRecipeIds((ids) => ids.filter((id) => id !== recipe.id));
    track("discover_passed_restored", { meal_id: recipe.id });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "saved", label: "Saved" },
    { id: "discover", label: "Discover" },
    { id: "add", label: "Add Recipe" },
  ];

  const allSaved = [...customRecipes, ...discoverSaved.filter((s) => !customRecipes.some((c) => c.id === s.id))];
  const availableTags = [...new Set(allSaved.flatMap((recipe) => recipe.tags))].sort((a, b) => a.localeCompare(b));
  // Keep the active tag filter valid if the underlying saved recipes change.
  const activeTagFilter = savedTagFilter && availableTags.includes(savedTagFilter) ? savedTagFilter : null;
  const filteredSaved = activeTagFilter ? allSaved.filter((recipe) => recipe.tags.includes(activeTagFilter)) : allSaved;
  const sortedSaved = [...filteredSaved].sort((a, b) => {
    if (savedSortBy === "time") return a.time - b.time;
    if (savedSortBy === "price") return a.price - b.price;
    if (savedSortBy === "health") return b.nutrition.protein - a.nutrition.protein || a.price - b.price;
    return 0;
  });
  const recentlyPassed = discoverRejected.filter((r) => !allSaved.some((s) => s.id === r.id));

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
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-stone-500">Sort by</span>
                {(["default", "time", "price", "health"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => { track("saved_sort_changed", { sort_by: option }); setSavedSortBy(option); }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition ${savedSortBy === option ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
                  >
                    {option === "default" ? "Default" : option === "health" ? "Nutrition" : option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
              {availableTags.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-stone-500">Filter by tag</span>
                  <button
                    type="button"
                    onClick={() => { track("saved_tag_filter_changed", { tag: null }); setSavedTagFilter(null); }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${activeTagFilter === null ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
                  >
                    All
                  </button>
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const next = activeTagFilter === tag ? null : tag;
                        track("saved_tag_filter_changed", { tag: next });
                        setSavedTagFilter(next);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition ${activeTagFilter === tag ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedSaved.map((recipe) => {
                const isOwn = recipe.isUserCreated === true;
                return (
                  <div
                    key={recipe.id}
                    className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectMeal(recipe.id)}
                      className="block w-full flex-1 text-left"
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
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      <AppButton
                        variant="ghost"
                        className="w-full text-sm text-stone-400 hover:text-rose-600"
                        onClick={() => setConfirmAction({ recipeId: recipe.id, isOwn })}
                      >
                        {isOwn ? "Delete recipe" : "Unsave"}
                      </AppButton>
                    </div>
                  </div>
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
            </>
          )}

          {recentlyPassed.length > 0 && (
            <section className="mt-10 border-t border-stone-200 pt-6">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-stone-700">Recently passed</h2>
                <Badge tone="neutral">{recentlyPassed.length}</Badge>
              </div>
              <p className="mb-4 text-sm text-stone-500">
                Recipes you passed on in Discover. Move one back to your saved list any time.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentlyPassed.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="flex flex-col rounded-xl border border-stone-200 bg-stone-50 p-4"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectMeal(recipe.id)}
                      className="flex-1 text-left transition hover:opacity-90"
                    >
                      <div className="flex items-start justify-between gap-2">
                        {recipe.photoUrl ? (
                          <img src={recipe.photoUrl} alt={recipe.name} className="h-12 w-12 rounded-md object-cover opacity-80" />
                        ) : (
                          <span className="text-3xl opacity-70">{recipe.image}</span>
                        )}
                        <Badge tone="neutral">Passed</Badge>
                      </div>
                      <p className="mt-2 break-words font-semibold leading-snug text-stone-700">{recipe.name}</p>
                      <p className="mt-1 text-sm font-medium text-stone-500">{money(recipe.price)}</p>
                      <p className="mt-1 text-xs text-stone-400">
                        {recipe.time} min · {recipe.ingredients.map(formatIngredient).slice(0, 3).join(", ")}
                        {recipe.ingredients.length > 3 ? ` +${recipe.ingredients.length - 3}` : ""}
                      </p>
                    </button>
                    <AppButton
                      variant="secondary"
                      className="mt-3 w-full justify-center"
                      onClick={() => handleRestorePassed(recipe)}
                    >
                      <RotateCcw size={15} /> Move to saved
                    </AppButton>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "discover" && (
        <DiscoverScreen
          prefs={prefs}
          deadlines={deadlines}
          sessionId={sessionId}
          customRecipes={customRecipes}
          saved={discoverSaved}
          setSaved={setDiscoverSaved}
          rejected={discoverRejected}
          setRejected={setDiscoverRejected}
          reviewedRecipeIds={discoverReviewedRecipeIds}
          setReviewedRecipeIds={setDiscoverReviewedRecipeIds}
          recommendationState={discoverRecommendationState}
          setRecommendationState={setDiscoverRecommendationState}
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

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.isOwn ? "Delete recipe?" : "Unsave recipe?"}
          message={
            confirmAction.isOwn
              ? "This will permanently remove your recipe from your library."
              : "This recipe will be removed from your saved list. You can save it again from Discover."
          }
          confirmLabel={confirmAction.isOwn ? "Delete" : "Unsave"}
          onConfirm={() => {
            if (confirmAction.isOwn) {
              setCustomRecipes((prev) => prev.filter((r) => r.id !== confirmAction.recipeId));
              deleteRecommenderRecipe(confirmAction.recipeId).catch((error) => {
                console.warn("Recipe could not be deleted from backend.", error);
              });
            } else {
              setDiscoverSaved((prev) => prev.filter((r) => r.id !== confirmAction.recipeId));
            }
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
