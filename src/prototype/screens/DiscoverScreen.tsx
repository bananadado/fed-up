import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { seedMeals } from "../data";
import type { Meal, PlanEntry, Preferences } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { formatCookingLimit, money } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";

export function DiscoverScreen({
  prefs,
  customRecipes,
  setPlan,
  plan,
  onSelectMeal,
  track,
}: {
  prefs: Preferences;
  customRecipes: Meal[];
  setPlan: (plan: PlanEntry[]) => void;
  plan: PlanEntry[];
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const initialQueue = [...customRecipes, ...seedMeals.filter((meal) => !customRecipes.some((customMeal) => customMeal.id === meal.id))];
  const [queue, setQueue] = useState(initialQueue);
  const [saved, setSaved] = useState<Meal[]>([]);
  const current = queue[0];

  function swipe(like: boolean) {
    if (current) {
      track("discover_recipe_swiped", { meal_id: current.id, liked: like });
    }

    if (current && like) {
      setSaved([...saved, current]);
    }

    setQueue(queue.slice(1));
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
        <p className="mt-2 text-stone-600">Swipe quickly; every option respects your {formatCookingLimit(prefs.maxTime).toLowerCase()} cooking limit or is a ready fallback.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <div>
          {current ? (
            <Card className="gap-0 overflow-hidden rounded-lg border-stone-200 bg-white shadow-sm">
              <div className="flex h-48 items-center justify-center bg-emerald-50 text-7xl">{current.image}</div>
              <div className="p-6">
                <div className="flex justify-between gap-3">
                  <h2 className="text-xl font-bold">{current.name}</h2>
                  <span className="whitespace-nowrap font-semibold text-emerald-700">{money(current.price)}</span>
                </div>
                <p className="mt-2 text-sm text-stone-500">
                  {current.source} - {current.time} minutes
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} tone="green">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="mt-6 flex gap-3">
                  <button type="button" aria-label="Reject recipe" onClick={() => swipe(false)} className="flex h-14 flex-1 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50">
                    <ThumbsDown />
                  </button>
                  <button type="button" aria-label="Like recipe" onClick={() => swipe(true)} className="flex h-14 flex-1 items-center justify-center rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
                    <ThumbsUp />
                  </button>
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
            {saved.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">Swipe right on a suitable recipe to save it here.</p>
            ) : (
              saved.map((meal) => (
                <div key={meal.id} className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 p-4">
                  <div>
                    <p className="font-semibold">
                      {meal.image} {meal.name}
                    </p>
                    <p className="text-sm text-stone-500">
                      {meal.time} min - {money(meal.price)}
                    </p>
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
