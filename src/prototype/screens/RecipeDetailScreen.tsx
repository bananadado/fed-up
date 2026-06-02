import { ArrowLeft, MessageSquare, Pencil } from "lucide-react";
import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Meal, RecipeReview, Screen } from "../types";
import { AppButton, Badge, Field } from "../components/primitives";
import { RecipeEditor, type RecipeEditorOutput } from "../components/RecipeEditor";
import { formatIngredient } from "../ingredients";
import { mealById, money, nutritionSourceSummary } from "../utils";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { createRecommenderRecipe } from "../recommenderApi";
import { fetchRecipeReviews, submitRecipeReview } from "../reviewsApi";
import { aggregateIngredients, groceryVendorById, groceryVendors } from "../shopping";
import type { TrackPrototypeEvent } from "../analytics";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

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
  setScreen,
  backTo,
  track,
}: {
  mealId: string;
  customRecipes: Meal[];
  setCustomRecipes: StateSetter<Meal[]>;
  setScreen: (screen: Screen) => void;
  backTo?: Screen | null;
  track: TrackPrototypeEvent;
}) {
  const meal = mealById(mealId, customRecipes);
  const [review, setReview] = useState({ author: "You", rating: 5, comment: "" });
  const [isEditing, setIsEditing] = useState(false);
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
  const shoppingItems = aggregateIngredients(selectedMeal.ingredients);

  function saveMeal(nextMeal: Meal) {
    setCustomRecipes((recipes) => [nextMeal, ...recipes.filter((recipe) => recipe.id !== nextMeal.id)]);
    // Re-embed user-created recipes on edit. Seed recipes are shared across all
    // users on the recommender, so we never overwrite them from a local edit.
    if (nextMeal.isUserCreated) {
      createRecommenderRecipe(nextMeal).catch((error) => {
        console.warn("Recipe could not be embedded on the recommender.", error);
      });
    }
  }

  function handleEditSubmit(output: RecipeEditorOutput, photoUrl: string | undefined) {
    saveMeal({
      ...selectedMeal,
      name: output.name || selectedMeal.name,
      time: output.time,
      price: output.price,
      ingredients: output.ingredients,
      tags: output.tags,
      allergens: output.allergens,
      nutrition: output.nutrition,
      instructions: output.instructions,
      note: output.note,
      ...(photoUrl !== undefined ? { photoUrl } : {}),
    });
    track("recipe_saved", {
      meal_id: selectedMeal.id,
      minutes: output.time,
      price: output.price,
      ingredient_count: output.ingredients.length,
      tag_count: output.tags.length,
    });
    setIsEditing(false);
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
        <AppButton variant="ghost" className="px-0" onClick={() => { track("recipe_back_clicked", { meal_id: selectedMeal.id, back_to: backTo ?? "plan" }); setScreen(backTo ?? "plan"); }}>
          <ArrowLeft size={16} /> {backLabel(backTo ?? null)}
        </AppButton>
        {!isEditing && (
          <div className="flex flex-wrap gap-3">
            <AppButton variant="secondary" onClick={() => { track("recipe_edit_started", { meal_id: selectedMeal.id }); setIsEditing(true); }}>
              <Pencil size={16} /> Edit recipe
            </AppButton>
          </div>
        )}
      </div>

      {isEditing ? (
        <RecipeEditor
          mode="edit"
          meal={selectedMeal}
          title="Edit recipe"
          description="Changes are saved into your recipe library for this prototype session."
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
                  <p className="text-xs text-stone-500">Time</p>
                  <p className="mt-1 font-semibold">{meal.time} min</p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <p className="text-xs text-stone-500">Cost</p>
                  <p className="mt-1 font-semibold">{money(meal.price)}</p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <p className="text-xs text-stone-500">Rating</p>
                  <p className="mt-1 font-semibold">{ratingLabel(computedRating)}</p>
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 p-4">
                <h2 className="font-bold">Nutrition</h2>
                <p className="mt-1 text-xs text-stone-500">{nutritionSourceSummary(meal.nutrition.source)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p>{meal.nutrition.calories} kcal</p>
                  <p>{meal.nutrition.protein}g protein</p>
                  <p>{meal.nutrition.carbs}g carbs</p>
                  <p>{meal.nutrition.fat}g fat</p>
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
                  <Badge tone={meal.type === "fallback" ? "amber" : meal.type === "cook" ? "green" : "neutral"}>{meal.type}</Badge>
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
                  <h2 className="text-xl font-bold">Ingredients</h2>
                  <ul className="mt-4 grid gap-2">
                    {meal.ingredients.map((ingredient) => (
                      <li key={`${ingredient.name}-${ingredient.quantity}-${ingredient.unit}`} className="rounded-lg bg-stone-50 px-3 py-2 text-stone-700">
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
                <dd className="font-semibold text-right">{meal.source}</dd>
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
    </div>
  );
}
