import { ArrowLeft, Bookmark, BookmarkCheck, ChevronDown, Clock3, MessageSquare, Minus, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Meal, RecipeReview, Screen } from "../types";
import { AppButton, Badge, Field } from "../components/primitives";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecipeEditor, type RecipeEditorOutput } from "../components/RecipeEditor";
import { formatIngredient, scaleIngredients } from "../ingredients";
import { normalizeIngredientUnit } from "../unitConversion";
import { mealById, money, nutritionSourceSummary, sourceUrl } from "../utils";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { createRecommenderRecipe, deleteRecommenderRecipe } from "../recommenderApi";
import { fetchRecipeReviews, submitRecipeReview } from "../reviewsApi";
import { aggregateIngredients, groceryVendorById, groceryVendors } from "../shopping";
import type { TrackEvent } from "../analytics";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const MAX_SERVINGS = 12;

function createRecipeId() {
  return `custom-${Date.now()}`;
}

function ratingLabel(rating: number) {
  return rating > 0 ? `${rating.toFixed(1)} / 5` : "No ratings yet";
}


function backLabel(backTo: Screen | null): string {
  if (backTo === "recipes") return "Back to recipes";
  return "Back to plan";
}

export function RecipeDetailScreen({
  mealId,
  customRecipes,
  setCustomRecipes,
  discoverSaved,
  setDiscoverSaved,
  setScreen,
  backTo,
  onSelectMeal,
  unpublishedSavedIds,
  track,
  unitSystem = "metric",
}: {
  mealId: string;
  customRecipes: Meal[];
  setCustomRecipes: StateSetter<Meal[]>;
  discoverSaved: Meal[];
  setDiscoverSaved: StateSetter<Meal[]>;
  setScreen: (screen: Screen) => void;
  backTo?: Screen | null;
  onSelectMeal: (mealId: string) => void;
  unpublishedSavedIds: Set<string>;
  track: TrackEvent;
  unitSystem?: "metric" | "imperial";
}) {
  const meal = mealById(mealId, customRecipes);
  const [review, setReview] = useState({ author: "You", rating: 5, comment: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [localUnitSystem, setLocalUnitSystem] = useState<"metric" | "imperial">(unitSystem);

  const baseServings = meal?.servings && meal.servings > 0 ? meal.servings : 1;
  // Track which recipe the chosen serving count belongs to so it resets to the
  // recipe's base whenever a different recipe is viewed — no effect needed.
  const [servingsState, setServingsState] = useState({ mealId, servings: baseServings });
  const servings = servingsState.mealId === mealId ? servingsState.servings : baseServings;

  useEffect(() => {
    function check() {
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 10;
      const nearBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 80;
      setShowScrollHint(scrollable && !nearBottom);
    }
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const isOwn = meal?.isUserCreated === true;
  const isSaved = isOwn || discoverSaved.some((r) => r.id === mealId);
  const [selectedVendorId, setSelectedVendorId] = useState(groceryVendors[0].id);
  // Reviews are owned by Firestore (issue #123): global and persistent, not part
  // of the local meal/session state.
  const [reviews, setReviews] = useState<RecipeReview[]>([]);
  const [reviewsRating, setReviewsRating] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchRecipeReviews(mealId)
      .then((result) => {
        if (!cancelled) {
          setReviews(result.reviews);
          setReviewsRating(result.rating);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Recipe reviews could not be loaded.", error);
          setReviews([]);
          setReviewsRating(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mealId]);

  const computedRating = reviews.length > 0 ? reviewsRating : meal?.rating ?? 0;

  if (!meal) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">Recipe not found</h1>
        <AppButton className="mt-5" onClick={() => setScreen("plan")}>
          Back to plan
        </AppButton>
      </div>
    );
  }

  const selectedMeal = meal;
  const selectedVendor = groceryVendorById(selectedVendorId);
  const scaleFactor = servings / baseServings;
  const scaledIngredients = scaleIngredients(selectedMeal.ingredients, scaleFactor).map((ing) =>
    normalizeIngredientUnit(ing, localUnitSystem),
  );
  const shoppingItems = aggregateIngredients(scaledIngredients);
  const isScaled = servings !== baseServings;

  function changeServings(delta: number) {
    const next = Math.min(MAX_SERVINGS, Math.max(1, servings + delta));
    if (next === servings) return;
    setServingsState({ mealId, servings: next });
    track("recipe_servings_changed", {
      meal_id: selectedMeal.id,
      servings: next,
      base_servings: baseServings,
    });
  }

  function saveMeal(nextMeal: Meal) {
    setCustomRecipes((recipes) => [nextMeal, ...recipes.filter((recipe) => recipe.id !== nextMeal.id)]);
    // Re-embed only if already published — unpublished recipes stay private until
    // the user explicitly publishes them.
    if (nextMeal.isUserCreated && nextMeal.published) {
      createRecommenderRecipe(nextMeal).catch((error) => {
        console.warn("Recipe could not be embedded on the recommender.", error);
      });
    }
  }

  function handlePublish() {
    saveMeal({ ...selectedMeal, published: true });
    track("custom_recipe_published", { meal_id: selectedMeal.id });
  }

  function handleUnpublish() {
    const unpublished = { ...selectedMeal, published: false };
    setCustomRecipes((recipes) => [unpublished, ...recipes.filter((r) => r.id !== unpublished.id)]);
    deleteRecommenderRecipe(selectedMeal.id).catch((error) => {
      console.warn("Recipe could not be unpublished from recommender.", error);
    });
    track("custom_recipe_unpublished", { meal_id: selectedMeal.id });
  }

  function handleEditSubmit(output: RecipeEditorOutput, photoUrl: string | undefined) {
    const updatedFields = {
      name: output.name || selectedMeal.name,
      time: output.time,
      price: output.price,
      servings: output.servings,
      mealSlots: output.mealSlots,
      ingredients: output.ingredients,
      tags: output.tags,
      allergens: output.allergens,
      nutrition: output.nutrition,
      instructions: output.instructions,
      note: output.note,
      ...(photoUrl !== undefined ? { photoUrl } : {}),
    };

    if (selectedMeal.isUserCreated) {
      // User owns this recipe — edit in place, keep same ID and reviews
      saveMeal({ ...selectedMeal, ...updatedFields });
      track("recipe_saved", {
        meal_id: selectedMeal.id,
        minutes: output.time,
        price: output.price,
        ingredient_count: output.ingredients.length,
        tag_count: output.tags.length,
      });
      setIsEditing(false);
    } else {
      // Seed or borrowed recipe — fork into a new user-owned copy
      const newRecipe: Meal = {
        ...selectedMeal,
        ...updatedFields,
        id: createRecipeId(),
        isUserCreated: true,
        rating: 0,
        reviews: [],
      };
      setCustomRecipes((recipes) => [newRecipe, ...recipes]);
      track("recipe_created_from_edit", {
        original_meal_id: selectedMeal.id,
        new_meal_id: newRecipe.id,
        minutes: newRecipe.time,
        price: newRecipe.price,
        ingredient_count: newRecipe.ingredients.length,
        tag_count: newRecipe.tags.length,
      });
      setIsEditing(false);
      onSelectMeal(newRecipe.id);
    }
  }

  function cancelEdit() {
    track("recipe_edit_cancelled", { meal_id: selectedMeal.id });
    setIsEditing(false);
  }

  function leaveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const comment = review.comment.trim();

    if (!comment) {
      return;
    }

    const rating = Math.min(5, Math.max(1, Number(review.rating) || 5));
    const author = review.author.trim() || "You";

    submitRecipeReview({ recipeId: selectedMeal.id, author, rating, comment })
      .then((result) => {
        setReviews(result.reviews);
        setReviewsRating(result.rating);
      })
      .catch((error) => {
        console.warn("Review could not be saved.", error);
      });

    track("recipe_review_submitted", { meal_id: selectedMeal.id, rating });
    setReview({ author: "You", rating: 5, comment: "" });
  }

  function selectVendor(vendorId: string) {
    setSelectedVendorId(vendorId);
    track("vendor_selected", { meal_id: selectedMeal.id, vendor: vendorId });
  }

  function openIngredientSearch(ingredient: string) {
    track("vendor_ingredient_search_opened", {
      meal_id: selectedMeal.id,
      ingredient,
      ingredient_count: selectedMeal.ingredients.length,
      vendor: selectedVendor.id,
    });
    window.open(selectedVendor.searchUrl(ingredient), "_blank", "noopener,noreferrer");
  }

  function copyShoppingList() {
    track("vendor_shopping_list_copied", {
      meal_id: selectedMeal.id,
      ingredient_count: selectedMeal.ingredients.length,
      vendor: selectedVendor.id,
    });
  }

  function toggleShoppingItem(ingredient: string, checked: boolean, checkedCount: number, itemCount: number) {
    track("vendor_shopping_item_toggled", {
      meal_id: selectedMeal.id,
      ingredient,
      checked,
      checked_count: checkedCount,
      ingredient_count: itemCount,
      vendor: selectedVendor.id,
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AppButton variant="ghost" className="px-0" onClick={() => { track("recipe_back_clicked", { meal_id: selectedMeal.id, back_to: backTo ?? "plan" }); setScreen(backTo ?? "plan"); }}>
            <ArrowLeft size={16} /> {backLabel(backTo ?? null)}
          </AppButton>
          {unpublishedSavedIds.has(mealId) && <Badge tone="amber">No longer published</Badge>}
        </div>
        {!isEditing && (
          <div className="flex flex-wrap gap-3">
            <AppButton variant="secondary" onClick={() => { track("recipe_edit_started", { meal_id: selectedMeal.id }); setIsEditing(true); }}>
              <Pencil size={16} /> Edit recipe
            </AppButton>
            {isOwn && !selectedMeal.published && (
              <AppButton variant="secondary" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setConfirmPublish(true)}>
                Publish recipe
              </AppButton>
            )}
            {isOwn && selectedMeal.published && (
              <AppButton variant="secondary" className="text-stone-500" onClick={() => setConfirmUnpublish(true)}>
                Unpublish
              </AppButton>
            )}
            {isOwn ? (
              <AppButton variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} /> Delete recipe
              </AppButton>
            ) : isSaved ? (
              <AppButton variant="secondary" onClick={() => setConfirmDelete(true)}>
                <BookmarkCheck size={16} /> Unsave
              </AppButton>
            ) : (
              <AppButton variant="secondary" onClick={() => {
                setDiscoverSaved((prev) => [meal, ...prev]);
                track("recipe_saved_from_detail", { meal_id: selectedMeal.id });
              }}>
                <Bookmark size={16} /> Save recipe
              </AppButton>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <RecipeEditor
          mode="edit"
          meal={selectedMeal}
          title="Edit recipe"
          description="Changes are saved into your recipe library for this app session."
          onSubmit={handleEditSubmit}
          onCancel={cancelEdit}
          track={track}
        />
      ) : (
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4 sm:p-6">
          <div className="grid gap-7 lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="aspect-[4/3] overflow-hidden rounded-lg bg-emerald-50 shadow-inner">
                {meal.photoUrl ? (
                  <img src={meal.photoUrl} alt={meal.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-8xl" role="img" aria-label={`${meal.name} image`}>
                    {meal.image}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-stone-50 p-3">
                  <p className="flex items-center gap-1 text-xs text-stone-500"><Clock3 size={12} /> Time</p>
                  <p className="mt-1 font-semibold">{meal.time} min</p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <p className="text-xs text-stone-500">Cost</p>
                  <p className="mt-1 font-semibold">{money(meal.price)}</p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <p className="flex items-center gap-1 text-xs text-stone-500"><Star size={12} /> Rating</p>
                  {computedRating > 0 ? (
                    <div className="mt-1 flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} size={13} className={i < Math.round(computedRating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"} />
                      ))}
                      <span className="ml-1 text-xs font-semibold text-stone-700">{computedRating.toFixed(1)}</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-stone-400">No ratings</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 p-4">
                <h2 className="font-bold">Nutrition</h2>
                <p className="mt-1 text-xs text-stone-500">per portion{(meal.servings ?? 1) > 1 ? ` · ${meal.servings} portions` : ""}</p>
                <p className="mt-0.5 text-xs text-stone-400">{nutritionSourceSummary(meal.nutrition.source)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {(() => { const s = meal.servings ?? 1; return (<>
                    <p>{Math.round(meal.nutrition.calories / s)} kcal</p>
                    <p>{Math.round(meal.nutrition.protein / s)}g protein</p>
                    <p>{Math.round(meal.nutrition.carbs / s)}g carbs</p>
                    <p>{Math.round(meal.nutrition.fat / s)}g fat</p>
                  </>); })()}
                </div>
              </div>
              <div>
                <h2 className="font-bold">Tags</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {meal.mealSlots.map((slot) => (
                    <Badge key={slot} tone="green">
                      {slot}
                    </Badge>
                  ))}
                  <Badge tone={meal.type === "fallback" ? "amber" : meal.type === "cook" ? "green" : "neutral"}>
                    {meal.type === "fallback" ? "Easy option" : meal.type === "cook" ? "Cook" : "Uses leftovers"}
                  </Badge>
                  {meal.tags.map((tag) => (
                    <Badge key={tag} tone="green">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="font-bold">Allergens</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {meal.allergens.length === 0 ? <Badge>No listed allergens</Badge> : meal.allergens.map((allergen) => <Badge key={allergen} tone="rose">{allergen}</Badge>)}
                </div>
              </div>
            </aside>

            <section className="min-w-0">
              <h1 className="break-words text-3xl font-bold text-stone-950 md:text-4xl">{meal.name}</h1>
              <p className="mt-2 text-stone-600">{meal.note}</p>
              <div className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-bold">Ingredients</h2>
                    <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1" role="group" aria-label="Unit system">
                      {(["metric", "imperial"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setLocalUnitSystem(option)}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition ${localUnitSystem === option ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
                        >
                          {option === "metric" ? "g/ml" : "oz/cup"}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1" role="group" aria-label="Servings">
                      <Users size={14} className="ml-1 text-stone-400" />
                      <button
                        type="button"
                        aria-label="Fewer servings"
                        onClick={() => changeServings(-1)}
                        disabled={servings <= 1}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-[5.5rem] text-center text-sm font-semibold text-stone-700" aria-live="polite">
                        {servings} {servings === 1 ? "serving" : "servings"}
                      </span>
                      <button
                        type="button"
                        aria-label="More servings"
                        onClick={() => changeServings(1)}
                        disabled={servings >= MAX_SERVINGS}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    </div>
                  </div>
                  {isScaled && (
                    <p className="mt-2 text-xs text-stone-500">
                      Scaled from {baseServings} {baseServings === 1 ? "serving" : "servings"}.{" "}
                      <button type="button" onClick={() => changeServings(baseServings - servings)} className="font-semibold text-emerald-700 underline underline-offset-2">
                        Reset
                      </button>
                    </p>
                  )}
                  <ul className="mt-4 grid gap-2">
                    {scaledIngredients.map((ingredient) => (
                      <li key={`${ingredient.name}-${ingredient.quantity}-${ingredient.unit}-${ingredient.preparation ?? ""}`} className="rounded-lg bg-stone-50 px-3 py-2 text-stone-700">
                        {formatIngredient(ingredient)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="text-xl font-bold">Method</h2>
                  <ol className="mt-4 space-y-3">
                    {meal.instructions.map((step, index) => (
                      <li key={step} className="flex gap-3 rounded-lg bg-stone-50 px-3 py-3 text-stone-700">
                        <span className="font-semibold text-stone-950">{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_330px]">
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6">
          <h2 className="text-xl font-bold">Reviews</h2>
          <form className="mt-5 space-y-4" onSubmit={leaveReview}>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <Field label="Name" value={review.author} onChange={(author) => setReview({ ...review, author })} />
              <Field label="Rating" type="number" value={review.rating} onChange={(rating) => setReview({ ...review, rating: +rating })} />
            </div>
            <label className="block">
              <span className="text-sm font-semibold">Review</span>
              <Textarea value={review.comment} onChange={(event) => setReview({ ...review, comment: event.target.value })} className="mt-2 rounded-lg border-stone-200 bg-white" placeholder="What worked, what would you change?" />
            </label>
            <AppButton type="submit">
              <MessageSquare size={16} /> Leave review
            </AppButton>
          </form>

          <div className="mt-6 space-y-3">
            {reviews.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">No reviews yet.</p>
            ) : (
              reviews.map((item) => (
                <div key={item.id} className="rounded-lg bg-stone-50 p-4">
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">{item.author}</p>
                    <p className="text-sm text-stone-500">{item.rating} / 5</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">{item.comment}</p>
                  <p className="mt-2 text-xs text-stone-400">{item.date.slice(0, 10)}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="order-first space-y-4 lg:order-none">
          <ShoppingListCard
            title="Recipe shopping list"
            description="Search ingredients one at a time, or copy the list for any supermarket app."
            items={shoppingItems}
            selectedVendor={selectedVendor}
            vendors={groceryVendors}
            onSelectVendor={selectVendor}
            onOpenIngredient={openIngredientSearch}
            onCopy={copyShoppingList}
            onToggleItem={toggleShoppingItem}
            storageKey={`deadline-food:recipe-shopping-list:${selectedMeal.id}`}
            compact
          />
          <Card className="h-fit gap-0 rounded-lg border-stone-200 bg-white p-5">
            <h2 className="font-bold">Quick info</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Source</dt>
                <dd className="font-semibold text-right">
                  {sourceUrl(meal.source) ? (
                    <a
                      href={sourceUrl(meal.source) as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                      onClick={() => track("recipe_source_link_clicked", { meal_id: selectedMeal.id })}
                    >
                      {meal.source}
                    </a>
                  ) : (
                    meal.source
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Cost</dt>
                <dd className="font-semibold">{money(meal.price)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Time</dt>
                <dd className="font-semibold">{meal.time} min</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Rating</dt>
                <dd className="font-semibold">{ratingLabel(computedRating)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {showScrollHint && !isEditing && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-0.5 md:bottom-8"
        >
          <span className="text-[10px] font-medium uppercase tracking-widest text-stone-500/80">scroll</span>
          <ChevronDown size={16} className="animate-bounce text-stone-500/80" />
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={isOwn ? "Delete recipe?" : "Unsave recipe?"}
          message={
            isOwn
              ? "This will permanently remove your recipe from your library."
              : "This recipe will be removed from your saved list. You can save it again from Discover."
          }
          confirmLabel={isOwn ? "Delete" : "Unsave"}
          onConfirm={() => {
            if (isOwn) {
              setCustomRecipes((prev) => prev.filter((r) => r.id !== mealId));
              deleteRecommenderRecipe(mealId).catch((error) => {
                console.warn("Recipe could not be deleted from backend.", error);
              });
              track("recipe_deleted", { meal_id: mealId });
              setScreen(backTo ?? "recipes");
            } else {
              setDiscoverSaved((prev) => prev.filter((r) => r.id !== mealId));
              track("recipe_unsaved_from_detail", { meal_id: mealId });
              setConfirmDelete(false);
            }
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmPublish && (
        <ConfirmDialog
          title="Publish recipe?"
          message="This will make your recipe visible to all users in Discover."
          confirmLabel="Publish"
          confirmVariant="primary"
          onConfirm={() => { handlePublish(); setConfirmPublish(false); }}
          onCancel={() => setConfirmPublish(false)}
        />
      )}

      {confirmUnpublish && (
        <ConfirmDialog
          title="Unpublish recipe?"
          message="This will remove your recipe from Discover. It stays in your library."
          confirmLabel="Unpublish"
          onConfirm={() => { handleUnpublish(); setConfirmUnpublish(false); }}
          onCancel={() => setConfirmUnpublish(false)}
        />
      )}
    </div>
  );
}
