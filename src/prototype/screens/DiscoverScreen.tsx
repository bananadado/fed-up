import { Sparkles, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { seedMeals } from "../data";
import type { Meal, PlanEntry, Preferences } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { formatCookingLimit, money, ingredientNames } from "../utils";
import { mealHealthSignals } from "../healthSignals";
import type { TrackPrototypeEvent } from "../analytics";

function StarRating({ rating, reviews }: { rating: number; reviews: number }) {
  if (rating === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={13} className={i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"} />
      ))}
      <span className="ml-0.5 text-sm font-medium text-stone-700">{rating.toFixed(1)}</span>
      {reviews > 0 && <span className="text-xs text-stone-400">({reviews})</span>}
    </span>
  );
}

export function DiscoverScreen({
  prefs,
  customRecipes,
  setPlan,
  plan,
  saved,
  setSaved,
  rejected,
  setRejected,
  onSelectMeal,
  track,
}: {
  prefs: Preferences;
  customRecipes: Meal[];
  setPlan: (plan: PlanEntry[]) => void;
  plan: PlanEntry[];
  saved: Meal[];
  setSaved: (saved: Meal[]) => void;
  rejected: Meal[];
  setRejected: (rejected: Meal[]) => void;
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const initialQueue = [...customRecipes, ...seedMeals.filter((meal) => !customRecipes.some((customMeal) => customMeal.id === meal.id))];
  const [sortBy, setSortBy] = useState<"priority" | "time" | "price" | "health">("priority");
  const [queue, setQueue] = useState(() => initialQueue.filter((meal) => !saved.some((s) => s.id === meal.id) && !rejected.some((r) => r.id === meal.id)));
  const sortedQueue = [...queue].sort((a, b) => {
    if (sortBy === "time") return a.time - b.time;
    if (sortBy === "price") return a.price - b.price;
    if (sortBy === "health") return b.nutrition.protein - a.nutrition.protein || a.price - b.price;
    return Number(b.tags.includes("high protein")) - Number(a.tags.includes("high protein")) || a.time - b.time;
  });
  const current = sortedQueue[0];

  function decideCurrentRecipe(like: boolean) {
    if (current) {
      track("discover_recipe_swiped", { meal_id: current.id, liked: like });
    }

    if (current && like) {
      setSaved([...saved, current]);
    } else if (current) {
      setRejected([current, ...rejected].slice(0, 3));
    }

    setQueue(queue.filter((meal) => meal.id !== current?.id));
  }

  function undo(meal: Meal) {
    setRejected(rejected.filter((m) => m.id !== meal.id));
    setQueue([meal, ...queue]);
    track("discover_recipe_undo", { meal_id: meal.id });
  }

  function addToPlan(meal: Meal) {
    const targetSlot = meal.mealSlots.includes("dinner") ? "dinner" : (meal.mealSlots[0] ?? "dinner");

    setPlan(
      plan.map((entry, index) =>
        index === 1
          ? {
              ...entry,
              meals: entry.meals.map((planMeal) => (planMeal.slot === targetSlot ? { ...planMeal, mealId: meal.id } : planMeal)),
            }
          : entry,
      ),
    );
    track("discover_recipe_added_to_plan", { meal_id: meal.id, target_day_index: 1, meal_slot: targetSlot });
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-3xl font-bold">Discover recipes</h1>
        <p className="mt-2 text-stone-600">
          Save or pass on each option. Every suggestion respects your {formatCookingLimit(prefs.maxTime).toLowerCase()} cooking limit or is a nearby campus fallback.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["priority", "time", "price", "health"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { track("discover_sort_changed", { sort_by: option }); setSortBy(option); }}
              className={`rounded-full border px-3 py-2 text-sm font-medium ${sortBy === option ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600"}`}
            >
              Sort by {option}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <div>
          {current ? (
            <Card className="gap-0 overflow-hidden rounded-lg border-stone-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => onSelectMeal(current.id)}
                className="flex h-48 w-full items-center justify-center bg-emerald-50 text-7xl transition hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                aria-label={`View details for ${current.name}`}
              >
                {current.image}
              </button>
              <div className="p-6">
                <button
                  type="button"
                  onClick={() => onSelectMeal(current.id)}
                  className="text-left text-xl font-bold transition hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                >
                  {current.name}
                </button>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <span className="whitespace-nowrap font-semibold text-stone-700">{current.time} min</span>
                  <span className="whitespace-nowrap font-semibold text-emerald-700">{money(current.price)}</span>
                  <StarRating rating={current.rating} reviews={current.reviews.length} />
                </div>
                <p className="mt-1 text-sm text-stone-400">{current.source}</p>
                <div className="mt-4 rounded-lg bg-stone-50 p-3">
                  <p className="text-xs font-semibold uppercase text-stone-500">Key ingredients</p>
                  <p className="mt-1 text-sm text-stone-700">{ingredientNames(current.ingredients, 5)}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} tone="green">
                      {tag}
                    </Badge>
                  ))}
                  {mealHealthSignals(current).map((signal) => (
                    <Badge key={signal} tone="blue">
                      {signal}
                    </Badge>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <AppButton type="button" variant="secondary" className="h-14 justify-center text-stone-600" onClick={() => decideCurrentRecipe(false)}>
                    <ThumbsDown size={18} /> Pass
                  </AppButton>
                  <AppButton type="button" className="h-14 justify-center" onClick={() => decideCurrentRecipe(true)}>
                    <ThumbsUp size={18} /> Save
                  </AppButton>
                </div>
                <AppButton variant="secondary" className="mt-3 w-full justify-center" onClick={() => onSelectMeal(current.id)}>
                  View recipe
                </AppButton>
              </div>
            </Card>
          ) : (
            <Card className="gap-0 rounded-lg border-stone-200 bg-white p-10 text-center">
              <Sparkles className="mx-auto text-emerald-700" />
              <p className="mt-4 font-semibold">You have reviewed today's suggestions.</p>
              <AppButton variant="secondary" className="mt-4" onClick={() => { track("discover_queue_restarted", { queue_size: initialQueue.length }); setQueue(initialQueue); }}>
                Restart
              </AppButton>
            </Card>
          )}
        </div>
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-5">
          <h2 className="font-bold">Liked recipes</h2>
          <p className="mt-1 text-sm text-stone-500">Add one directly into Tuesday's plan.</p>
          <div className="mt-4 space-y-3">
            {rejected.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-stone-400">Recently passed</p>
                {rejected.map((meal) => (
                  <div key={meal.id} className="grid gap-3 rounded-lg bg-rose-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <button type="button" onClick={() => onSelectMeal(meal.id)} className="break-words text-left font-semibold text-stone-800 hover:text-emerald-700 hover:underline">
                        {meal.image} {meal.name}
                      </button>
                      <p className="text-sm text-stone-500">{meal.time} min · {money(meal.price)}</p>
                      <StarRating rating={meal.rating} reviews={meal.reviews.length} />
                    </div>
                    <AppButton variant="secondary" onClick={() => undo(meal)}>Undo</AppButton>
                    <AppButton variant="ghost" onClick={() => onSelectMeal(meal.id)}>View</AppButton>
                  </div>
                ))}
              </div>
            )}
            {saved.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">Use Save on a recipe card to keep suitable options here.</p>
            ) : (
              saved.map((meal) => (
                <div key={meal.id} className="grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onSelectMeal(meal.id)} className="break-words text-left font-semibold hover:text-emerald-700 hover:underline">
                      {meal.image} {meal.name}
                    </button>
                    <p className="text-sm text-stone-500">
                      {meal.time} min - {money(meal.price)}
                    </p>
                    <StarRating rating={meal.rating} reviews={meal.reviews.length} />
                    <p className="mt-1 truncate text-xs text-stone-500">{ingredientNames(meal.ingredients, 4)}</p>
                  </div>
                  <AppButton variant="secondary" onClick={() => addToPlan(meal)}>
                    Use
                  </AppButton>
                  <AppButton variant="ghost" onClick={() => onSelectMeal(meal.id)}>
                    View
                  </AppButton>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
