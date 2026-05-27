import { ArrowLeft, MessageSquare, Pencil, Save, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { seedMeals } from "../data";
import type { Meal, Screen } from "../types";
import { AppButton, Badge, Field } from "../components/primitives";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { aggregateIngredients } from "../shopping";
import { mealById, money } from "../utils";

type RecipeForm = {
  name: string;
  time: number;
  price: number;
  ingredients: string;
  tags: string;
  allergens: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  instructions: string;
  note: string;
};

function mealToForm(meal: Meal): RecipeForm {
  return {
    name: meal.name,
    time: meal.time,
    price: meal.price,
    ingredients: meal.ingredients.join(", "),
    tags: meal.tags.join(", "),
    allergens: meal.allergens.join(", "),
    calories: meal.nutrition.calories,
    protein: meal.nutrition.protein,
    carbs: meal.nutrition.carbs,
    fat: meal.nutrition.fat,
    instructions: meal.instructions.join("\n"),
    note: meal.note,
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ratingLabel(rating: number) {
  return rating > 0 ? `${rating.toFixed(1)} / 5` : "No ratings yet";
}

export function RecipeDetailScreen({
  mealId,
  customRecipes,
  setCustomRecipes,
  setScreen,
}: {
  mealId: string;
  customRecipes: Meal[];
  setCustomRecipes: (recipes: Meal[]) => void;
  setScreen: (screen: Screen) => void;
}) {
  const meal = mealById(mealId, customRecipes);
  const fallbackMeal = (seedMeals[0] ?? customRecipes[0]) as Meal;
  const [form, setForm] = useState<RecipeForm>(() => mealToForm(meal ?? fallbackMeal));
  const [review, setReview] = useState({ author: "You", rating: 5, comment: "" });
  const [isEditing, setIsEditing] = useState(false);

  const computedRating = useMemo(() => {
    if (!meal || meal.reviews.length === 0) {
      return meal?.rating ?? 0;
    }

    return meal.reviews.reduce((sum, item) => sum + item.rating, 0) / meal.reviews.length;
  }, [meal]);

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
  const shoppingItems = aggregateIngredients(selectedMeal.ingredients);

  function saveMeal(nextMeal: Meal) {
    setCustomRecipes([nextMeal, ...customRecipes.filter((recipe) => recipe.id !== nextMeal.id)]);
  }

  function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    saveMeal({
      ...selectedMeal,
      name: form.name.trim() || selectedMeal.name,
      time: Number(form.time) || 0,
      price: Number(form.price) || 0,
      ingredients: splitList(form.ingredients),
      tags: splitList(form.tags),
      allergens: splitList(form.allergens),
      nutrition: {
        calories: Number(form.calories) || 0,
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
      },
      instructions: form.instructions
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean),
      note: form.note.trim(),
    });
    setIsEditing(false);
  }

  function cancelEdit() {
    setForm(mealToForm(selectedMeal));
    setIsEditing(false);
  }

  function leaveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const comment = review.comment.trim();

    if (!comment) {
      return;
    }

    const nextReviews = [
      {
        id: `review-${Date.now()}`,
        author: review.author.trim() || "You",
        rating: Math.min(5, Math.max(1, Number(review.rating) || 5)),
        comment,
        date: new Date().toISOString().slice(0, 10),
      },
      ...selectedMeal.reviews,
    ];
    const nextRating = nextReviews.reduce((sum, item) => sum + item.rating, 0) / nextReviews.length;

    saveMeal({ ...selectedMeal, reviews: nextReviews, rating: nextRating });
    setReview({ author: "You", rating: 5, comment: "" });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <AppButton variant="ghost" className="px-0" onClick={() => setScreen("plan")}>
          <ArrowLeft size={16} /> Back to plan
        </AppButton>
        {!isEditing && (
          <AppButton variant="secondary" onClick={() => setIsEditing(true)}>
            <Pencil size={16} /> Edit recipe
          </AppButton>
        )}
      </div>

      {isEditing ? (
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Edit recipe</h1>
              <p className="mt-2 text-stone-600">Changes are saved into your recipe library for this prototype session.</p>
            </div>
            <AppButton type="button" variant="secondary" onClick={cancelEdit}>
              <X size={16} /> Cancel
            </AppButton>
          </div>
          <form className="mt-5 space-y-4" onSubmit={saveRecipe}>
            <Field label="Recipe name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Time (mins)" type="number" value={form.time} onChange={(time) => setForm({ ...form, time: +time })} />
              <Field label="Cost / portion (£)" type="number" step="0.05" value={form.price} onChange={(price) => setForm({ ...form, price: +price })} />
            </div>
            <Field label="Ingredients" value={form.ingredients} onChange={(ingredients) => setForm({ ...form, ingredients })} />
            <Field label="Tags" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
            <Field label="Allergens" value={form.allergens} onChange={(allergensValue) => setForm({ ...form, allergens: allergensValue })} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Calories" type="number" value={form.calories} onChange={(calories) => setForm({ ...form, calories: +calories })} />
              <Field label="Protein (g)" type="number" value={form.protein} onChange={(protein) => setForm({ ...form, protein: +protein })} />
              <Field label="Carbs (g)" type="number" value={form.carbs} onChange={(carbs) => setForm({ ...form, carbs: +carbs })} />
              <Field label="Fat (g)" type="number" value={form.fat} onChange={(fat) => setForm({ ...form, fat: +fat })} />
            </div>
            <label className="block">
              <span className="text-sm font-semibold">Method</span>
              <Textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} className="mt-2 min-h-36 rounded-lg border-stone-200 bg-white" />
            </label>
            <Field label="Notes" value={form.note} onChange={(note) => setForm({ ...form, note })} />
            <AppButton type="submit">
              <Save size={16} /> Save recipe
            </AppButton>
          </form>
        </Card>
      ) : (
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4 sm:p-6">
          <div className="grid gap-7 lg:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-emerald-50 text-8xl shadow-inner" role="img" aria-label={`${meal.name} image`}>
                {meal.image}
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
              <h1 className="text-3xl font-bold text-stone-950 md:text-4xl">{meal.name}</h1>
              <p className="mt-2 text-stone-600">{meal.note}</p>
              <div className="mt-7 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
                <div>
                  <h2 className="text-xl font-bold">Ingredients</h2>
                  <ul className="mt-4 grid gap-2">
                    {meal.ingredients.map((ingredient) => (
                      <li key={ingredient} className="rounded-lg bg-stone-50 px-3 py-2 text-stone-700">
                        {ingredient}
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
            {meal.reviews.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">No reviews yet.</p>
            ) : (
              meal.reviews.map((item) => (
                <div key={item.id} className="rounded-lg bg-stone-50 p-4">
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">{item.author}</p>
                    <p className="text-sm text-stone-500">{item.rating} / 5</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">{item.comment}</p>
                  <p className="mt-2 text-xs text-stone-400">{item.date}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <ShoppingListCard
            title="Recipe shopping basket"
            description="Ingredients for this recipe, ready to search at Tesco."
            items={shoppingItems}
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
