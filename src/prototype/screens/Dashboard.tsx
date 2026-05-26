import { ChevronRight, Clock3, CookingPot, Flame } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Meal, PlanEntry, Preferences, Screen } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { AppButton, Badge } from "../components/primitives";
import { getMealById, money } from "../utils";

export function Dashboard({
  prefs,
  plan,
  customRecipes,
  setScreen,
}: {
  prefs: Preferences;
  plan: PlanEntry[];
  customRecipes: Meal[];
  setScreen: (screen: Screen) => void;
}) {
  const nextCook = plan
    .map((entry) => ({ ...entry, meal: getMealById(entry.mealId, customRecipes) }))
    .find((entry) => entry.meal.type === "cook");

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge tone="rose">
            <Flame size={12} className="mr-1" /> Deadline Mode active
          </Badge>
          <h1 className="mt-3 text-3xl font-bold">Your week is covered.</h1>
          <p className="mt-2 text-stone-600">Mixed Mode: quick preparation plus realistic campus fallbacks.</p>
        </div>
        <AppButton variant="secondary" onClick={() => setScreen("plan")}>
          View full plan <ChevronRight size={16} />
        </AppButton>
      </div>
      <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="space-y-5">
          <BudgetCard plan={plan} customRecipes={customRecipes} budget={prefs.budget} />
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
              <CookingPot size={17} /> Next cooking
            </div>
            {nextCook ? (
              <>
                <p className="mt-4 text-xl font-bold">
                  {nextCook.meal.image} {nextCook.meal.name}
                </p>
                <p className="mt-2 text-sm text-stone-500">
                  {nextCook.day} - {nextCook.context}
                </p>
                <div className="mt-4 flex gap-2">
                  <Badge tone="green">
                    <Clock3 size={12} className="mr-1" /> {nextCook.meal.time} min
                  </Badge>
                  <Badge>{money(nextCook.meal.price)}</Badge>
                </div>
              </>
            ) : (
              <p className="mt-3 text-stone-500">No cooking planned this week.</p>
            )}
          </Card>
        </div>
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold">Upcoming deadlines & meals</h2>
            <button type="button" onClick={() => setScreen("calendar")} className="text-sm font-semibold text-emerald-700">
              Calendar
            </button>
          </div>
          <div className="space-y-3">
            {plan.slice(0, 4).map((entry) => {
              const meal = getMealById(entry.mealId, customRecipes);

              return (
                <div key={entry.day} className="flex gap-3 rounded-lg bg-stone-50 p-4">
                  <div className="mt-1 h-10 w-1 rounded-full bg-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-semibold">{entry.day}</p>
                      <p className="text-sm text-stone-500">{meal.time} min</p>
                    </div>
                    <p className="mt-1 truncate font-medium">
                      {meal.image} {meal.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-stone-500">{entry.context}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
