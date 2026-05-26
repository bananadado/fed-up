import { Clock3, Heart, RefreshCcw, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { seedMeals } from "../data";
import type { Meal, PlanEntry, Preferences, Screen } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { AppButton, Badge } from "../components/primitives";
import { getMealById, money } from "../utils";

export function PlanScreen({
  plan,
  setPlan,
  prefs,
  customRecipes,
  setScreen,
}: {
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  prefs: Preferences;
  customRecipes: Meal[];
  setScreen: (screen: Screen) => void;
}) {
  const [rescueDay, setRescueDay] = useState<string | null>(null);
  const original = rescueDay ? plan.find((entry) => entry.day === rescueDay) : null;
  const originalMeal = original ? getMealById(original.mealId, customRecipes) : null;
  const avoided = useMemo(() => [...prefs.dislikes, ...prefs.allergens].map((value) => value.toLowerCase()), [prefs.dislikes, prefs.allergens]);
  const fallback = useMemo(
    () =>
      seedMeals
        .filter((meal) => meal.type === "fallback" && !meal.ingredients.some((ingredient) => avoided.includes(ingredient.toLowerCase())))
        .sort((a, b) => a.time - b.time || a.price - b.price)[0],
    [avoided],
  );
  const total = plan.reduce((sum, entry) => sum + getMealById(entry.mealId, customRecipes).price, 0);
  const newTotal = originalMeal && fallback ? total - originalMeal.price + fallback.price : total;

  function confirmSwap() {
    if (!rescueDay || !fallback) {
      return;
    }

    setPlan(plan.map((entry) => (entry.day === rescueDay ? { ...entry, mealId: fallback.id, rescued: true } : entry)));
    setRescueDay(null);
  }

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Planned meals</h1>
          <p className="mt-2 text-stone-600">A practical plan for your deadline-heavy week.</p>
        </div>
        <AppButton variant="secondary" onClick={() => setScreen("discover")}>
          <Heart size={16} /> Find alternatives
        </AppButton>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_310px]">
        <div className="space-y-3">
          {plan.map((entry) => {
            const meal = getMealById(entry.mealId, customRecipes);
            const canRescue = meal.type !== "fallback";

            return (
              <Card key={entry.day} className="gap-0 rounded-lg border-stone-200 bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{entry.day}</p>
                      {entry.rescued && <Badge tone="blue">Rescued</Badge>}
                      <Badge tone={meal.type === "fallback" ? "amber" : meal.type === "cook" ? "green" : "neutral"}>
                        {meal.type === "fallback" ? "Campus fallback" : meal.type === "cook" ? "Cook" : "Remix"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">{entry.context}</p>
                    <p className="mt-3 text-lg font-semibold">
                      {meal.image} {meal.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-stone-600">
                      <span className="flex items-center gap-1">
                        <Clock3 size={14} /> {meal.time} mins
                      </span>
                      <span>{money(meal.price)}</span>
                      <span>{meal.source}</span>
                    </div>
                  </div>
                  {canRescue && (
                    <AppButton variant="danger" onClick={() => setRescueDay(entry.day)}>
                      <RefreshCcw size={15} /> This is too much time
                    </AppButton>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="space-y-4">
          <BudgetCard plan={plan} customRecipes={customRecipes} budget={prefs.budget} />
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4">
            <p className="font-semibold">Prototype data</p>
            <p className="mt-2 text-sm text-stone-500">Provider prices and availability are illustrative. Swaps are filtered using your saved restrictions.</p>
          </Card>
        </div>
      </div>
      {rescueDay && fallback && originalMeal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/40 p-0 sm:items-center sm:p-5">
          <Card className="w-full max-w-lg gap-0 rounded-t-lg bg-white p-6 shadow-2xl sm:rounded-lg">
            <div className="flex justify-between">
              <div>
                <Badge tone="amber">Rescue mode</Badge>
                <h2 className="mt-3 text-2xl font-bold">No time to cook tonight?</h2>
              </div>
              <button type="button" aria-label="Close rescue mode" onClick={() => setRescueDay(null)} className="h-fit rounded-lg p-2 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <p className="mt-2 text-stone-600">Switch to a nearby option without abandoning your plan.</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-lg bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase text-stone-500">Original</p>
                <div className="mt-2 flex justify-between gap-3">
                  <p className="font-semibold">{originalMeal.name}</p>
                  <p className="text-sm">
                    {originalMeal.time} min - {money(originalMeal.price)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase text-emerald-700">Fastest suitable fallback</p>
                <div className="mt-2 flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {fallback.image} {fallback.name}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">{fallback.source}</p>
                  </div>
                  <p className="whitespace-nowrap text-sm">
                    {fallback.time} min - {money(fallback.price)}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-lg bg-stone-900 p-4 text-sm text-white">
              <p>
                <strong>{originalMeal.time - fallback.time} minutes saved.</strong> New weekly total: {money(newTotal)}.
              </p>
              <p className="mt-1 text-stone-300">{prefs.budget - newTotal >= 0 ? `Still ${money(prefs.budget - newTotal)} within budget.` : `${money(newTotal - prefs.budget)} over budget.`}</p>
            </div>
            <div className="mt-5 flex gap-3">
              <AppButton variant="secondary" className="flex-1" onClick={() => setRescueDay(null)}>
                Keep original
              </AppButton>
              <AppButton className="flex-1" onClick={confirmSwap}>
                Confirm swap
              </AppButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
