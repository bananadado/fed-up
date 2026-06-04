import { ChevronRight, Clock3, RefreshCcw, Sparkles, Utensils } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import type { Meal, MealSlot, PlanEntry, Preferences, Screen } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { AppButton, Badge } from "../components/primitives";
import { SwapModal } from "../components/SwapModal";
import { getMealById, money } from "../utils";
import { mealHealthSignals } from "../healthSignals";
import type { TrackPrototypeEvent } from "../analytics";

export function Dashboard({
  prefs,
  plan,
  setPlan,
  customRecipes,
  setScreen,
  onSelectMeal,
  planStale,
  planGenerated,
  regenerating,
  onRegenerate,
  track,
}: {
  prefs: Preferences;
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  customRecipes: Meal[];
  setScreen: (screen: Screen) => void;
  onSelectMeal: (mealId: string) => void;
  planStale: boolean;
  planGenerated: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  track: TrackPrototypeEvent;
}) {
  const [rescueChoice, setRescueChoice] = useState<{ day: string; slot: MealSlot } | null>(null);
  const nextMeal = plan
    .flatMap((entry) =>
      entry.meals.map((planMeal) => ({
        day: entry.day,
        context: entry.context,
        slot: planMeal.slot,
        mealId: planMeal.mealId,
        meal: getMealById(planMeal.mealId, customRecipes),
      })),
    )
    .at(0) ?? null;

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Your week is covered.</h1>
          <p className="mt-2 text-stone-600">Mixed Mode: quick preparation plus realistic campus fallbacks.</p>
        </div>
        <AppButton variant="secondary" onClick={() => { track("dashboard_full_plan_clicked"); setScreen("plan"); }}>
          View full plan <ChevronRight size={16} />
        </AppButton>
      </div>
      {planStale && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-emerald-100 p-1.5 text-emerald-700">
              <Sparkles size={16} />
            </span>
            <p className="text-sm leading-6 text-emerald-900">
              {planGenerated
                ? "Your calendar or recipes changed. Regenerate your plan to keep it in step with your week."
                : "Generate a plan from your saved recipes and calendar to get started."}
            </p>
          </div>
          <AppButton
            className="shrink-0 justify-center"
            disabled={regenerating}
            onClick={() => { track("auto_plan_regenerate_clicked", { source: "dashboard", stale: planStale }); onRegenerate(); }}
          >
            <Sparkles size={16} /> {regenerating ? "Building plan…" : planGenerated ? "Regenerate plan" : "Generate plan"}
          </AppButton>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="space-y-5">
          <BudgetCard plan={plan} customRecipes={customRecipes} budget={prefs.budget} />
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-600">
              <Utensils size={17} /> Next meal
            </div>
            {nextMeal ? (
              <>
                <button
                  type="button"
                  onClick={() => { track("dashboard_next_meal_clicked", { meal_id: nextMeal.mealId }); onSelectMeal(nextMeal.mealId); }}
                  className="mt-4 break-words text-left text-xl font-bold transition hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                >
                  {nextMeal.meal.image} {nextMeal.meal.name}
                </button>
                <p className="mt-2 text-sm text-stone-500">
                  {nextMeal.day} {nextMeal.slot} - {nextMeal.context}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="green">
                    <Clock3 size={12} className="mr-1" /> {nextMeal.meal.time} min
                  </Badge>
                  <Badge>{money(nextMeal.meal.price)}</Badge>
                  {mealHealthSignals(nextMeal.meal).map((signal) => (
                    <Badge key={signal} tone="blue">
                      {signal}
                    </Badge>
                  ))}
                </div>
                <AppButton variant="secondary" className="mt-4 w-full justify-center px-3 py-2 text-xs" onClick={() => { track("meal_swap_started", { day: nextMeal.day, meal_slot: nextMeal.slot, meal_id: nextMeal.mealId, layout: "dashboard_next_meal" }); setRescueChoice({ day: nextMeal.day, slot: nextMeal.slot }); }}>
                  <RefreshCcw size={13} /> Change meal
                </AppButton>
              </>
            ) : (
              <p className="mt-3 text-stone-500">No meals planned this week.</p>
            )}
          </Card>
          <Card className="gap-0 rounded-lg border-emerald-100 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <Sparkles size={17} /> Discover new recipes
            </div>
            <p className="mt-2 text-sm text-stone-600">Find personalised meal ideas matched to your taste and budget.</p>
            <AppButton
              variant="secondary"
              className="mt-4 w-full justify-center px-3 py-2 text-xs"
              onClick={() => {
                track("dashboard_discover_clicked");
                try { sessionStorage.setItem("deadlineFood:recipesTab", "discover"); } catch { /* ignore */ }
                setScreen("recipes");
              }}
            >
              Browse recipes <Sparkles size={13} />
            </AppButton>
          </Card>
        </div>
        <Card className="gap-0 rounded-lg border-stone-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold">Upcoming meals</h2>
            <button type="button" onClick={() => { track("dashboard_calendar_clicked"); setScreen("calendar"); }} className="text-sm font-semibold text-emerald-700">
              Calendar
            </button>
          </div>
          <div className="space-y-3">
            {plan.slice(0, 4).map((entry) => {
              return (
                <div key={entry.day} className="flex gap-3 rounded-lg bg-stone-50 p-4">
                  <div className="mt-1 h-10 w-1 rounded-full bg-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-semibold">{entry.day}</p>
                      <p className="text-sm text-stone-500">{entry.meals.length} meals</p>
                    </div>
                    <p className="mt-1 truncate text-xs text-stone-500">{entry.context}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {entry.meals.map((planMeal) => {
                        const meal = getMealById(planMeal.mealId, customRecipes);

                        return (
                          <div key={planMeal.slot} className="relative min-w-0 rounded-lg bg-white px-3 py-2">
                            <button
                              type="button"
                              onClick={() => onSelectMeal(planMeal.mealId)}
                              className="block w-full text-left transition hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                            >
                              <p className="text-[11px] font-semibold uppercase text-stone-500">{planMeal.slot}</p>
                              <p className="mt-1 truncate pr-5 text-sm font-medium">
                                {meal.image} {meal.name}
                              </p>
                            </button>
                            <button
                              type="button"
                              aria-label="Change meal"
                              onClick={() => { track("meal_swap_started", { day: entry.day, meal_slot: planMeal.slot, meal_id: planMeal.mealId, layout: "dashboard" }); setRescueChoice({ day: entry.day, slot: planMeal.slot }); }}
                              className="absolute right-1.5 top-1.5 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                            >
                              <RefreshCcw size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      {rescueChoice && (
        <SwapModal
          rescueChoice={rescueChoice}
          onClose={() => setRescueChoice(null)}
          plan={plan}
          setPlan={setPlan}
          prefs={prefs}
          customRecipes={customRecipes}
          onSelectMeal={onSelectMeal}
          track={track}
        />
      )}
    </div>
  );
}
