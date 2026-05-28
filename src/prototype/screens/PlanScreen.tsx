import { ArrowLeft, Clock3, Heart, RefreshCcw, X } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { mealSlots, seedMeals } from "../data";
import type { Meal, MealSlot, PlanEntry, Preferences, Screen } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { AppButton, Badge } from "../components/primitives";
import { ingredientName } from "../ingredients";
import { getMealById, money } from "../utils";
import { mealHealthSignals, weeklyBalanceSummary } from "../healthSignals";
import type { TrackPrototypeEvent } from "../analytics";

type RescueChoice = {
  day: string;
  slot: MealSlot;
} | null;

const slotLabels: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export function PlanScreen({
  plan,
  setPlan,
  prefs,
  customRecipes,
  setScreen,
  onSelectMeal,
  track,
}: {
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  prefs: Preferences;
  customRecipes: Meal[];
  setScreen: (screen: Screen) => void;
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const [rescueChoice, setRescueChoice] = useState<RescueChoice>(null);
  const [browseMode, setBrowseMode] = useState(false);
  const originalDay = rescueChoice ? plan.find((entry) => entry.day === rescueChoice.day) : null;
  const originalPlanMeal = originalDay && rescueChoice ? originalDay.meals.find((meal) => meal.slot === rescueChoice.slot) : null;
  const originalMeal = originalPlanMeal ? getMealById(originalPlanMeal.mealId, customRecipes) : null;
  const avoided = [...prefs.dislikes, ...prefs.allergens].map((value) => value.toLowerCase());
  const replacement = seedMeals
    .filter((meal) => rescueChoice && meal.mealSlots.includes(rescueChoice.slot))
    .filter((meal) => meal.id !== originalPlanMeal?.mealId)
    .filter((meal) => !meal.ingredients.some((ingredient) => avoided.includes(ingredientName(ingredient).toLowerCase())))
    .filter((meal) => !meal.allergens.some((allergen) => avoided.includes(allergen.toLowerCase())))
    .sort((a, b) => a.time - b.time || a.price - b.price)[0];
  const browseOptions = rescueChoice
    ? [...customRecipes, ...seedMeals.filter((m) => !customRecipes.some((c) => c.id === m.id))]
        .filter((meal) => meal.mealSlots.includes(rescueChoice.slot))
        .filter((meal) => meal.id !== originalPlanMeal?.mealId)
        .filter((meal) => !meal.ingredients.some((ingredient) => avoided.includes(ingredientName(ingredient).toLowerCase())))
        .filter((meal) => !meal.allergens.some((allergen) => avoided.includes(allergen.toLowerCase())))
        .sort((a, b) => {
          const aScore = a.tags.filter((tag) => prefs.likes.some((like) => like.toLowerCase() === tag.toLowerCase())).length;
          const bScore = b.tags.filter((tag) => prefs.likes.some((like) => like.toLowerCase() === tag.toLowerCase())).length;
          return bScore - aScore || a.time - b.time || a.price - b.price;
        })
    : [];
  const total = plan.reduce(
    (sum, entry) => sum + entry.meals.reduce((daySum, meal) => daySum + getMealById(meal.mealId, customRecipes).price, 0),
    0,
  );
  const newTotal = originalMeal && replacement ? total - originalMeal.price + replacement.price : total;

  function closeModal() {
    setBrowseMode(false);
    setRescueChoice(null);
  }

  function confirmSwapWith(meal: Meal, source: "suggested" | "browse") {
    if (!rescueChoice) return;

    setPlan(
      plan.map((entry) =>
        entry.day === rescueChoice.day
          ? {
              ...entry,
              meals: entry.meals.map((m) => (m.slot === rescueChoice.slot ? { ...m, mealId: meal.id, rescued: true } : m)),
            }
          : entry,
      ),
    );
    track("meal_swap_confirmed", {
      day: rescueChoice.day,
      meal_slot: rescueChoice.slot,
      original_meal_id: originalPlanMeal?.mealId,
      replacement_meal_id: meal.id,
      minutes_saved: originalMeal ? Math.max(0, originalMeal.time - meal.time) : undefined,
      source,
    });
    closeModal();
  }

  function confirmSwap() {
    if (!replacement) return;
    confirmSwapWith(replacement, "suggested");
  }

  return (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Planned meals</h1>
          <p className="mt-2 text-stone-600">A practical plan for your deadline-heavy week.</p>
        </div>
        <AppButton variant="secondary" onClick={() => { track("find_alternatives_clicked", { source_screen: "plan" }); setScreen("discover"); }}>
          <Heart size={16} /> Find alternatives
        </AppButton>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="hidden overflow-hidden rounded-lg border border-stone-200 bg-white md:block">
            <div className="grid grid-cols-[minmax(100px,0.55fr)_repeat(3,minmax(0,1fr))] border-b border-stone-200 bg-stone-50 text-sm font-semibold text-stone-600">
              <div className="px-4 py-3">Day</div>
              {mealSlots.map((slot) => (
                <div key={slot} className="border-l border-stone-200 px-4 py-3">
                  {slotLabels[slot]}
                </div>
              ))}
            </div>
            {plan.map((entry) => (
              <div key={entry.day} className="grid grid-cols-[minmax(100px,0.55fr)_repeat(3,minmax(0,1fr))] border-b border-stone-200 last:border-b-0">
                <div className="bg-stone-50 px-4 py-4">
                  <p className="font-bold">{entry.day}</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">{entry.context}</p>
                </div>
                {mealSlots.map((slot) => {
                  const planMeal = entry.meals.find((meal) => meal.slot === slot);
                  const meal = getMealById(planMeal?.mealId ?? "m1", customRecipes);

                  return (
                    <div key={slot} className="border-l border-stone-200 p-3">
                      <div className="flex h-full min-h-[178px] flex-col justify-between rounded-lg bg-stone-50 p-3">
                        <button
                          type="button"
                          onClick={() => onSelectMeal(meal.id)}
                          className="text-left transition hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {planMeal?.rescued && <Badge tone="blue">Rescued</Badge>}
                            <Badge tone={meal.type === "fallback" ? "amber" : meal.type === "cook" ? "green" : "neutral"}>
                              {meal.type === "fallback" ? "Fallback" : meal.type === "cook" ? "Cook" : "Remix"}
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm font-semibold leading-5">
                            {meal.image} {meal.name}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                            <span className="flex items-center gap-1">
                              <Clock3 size={14} /> {meal.time} mins
                            </span>
                            <span>{money(meal.price)}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {mealHealthSignals(meal).map((signal) => (
                              <Badge key={signal} tone="blue">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-stone-500">{meal.source}</p>
                        </button>
                        <AppButton variant="secondary" className="mt-4 w-full justify-center px-3 py-2 text-xs" onClick={() => { track("meal_swap_started", { day: entry.day, meal_slot: slot, meal_id: meal.id, layout: "desktop" }); setRescueChoice({ day: entry.day, slot }); }}>
                          <RefreshCcw size={15} /> Change meal
                        </AppButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="space-y-4 md:hidden">
            {plan.map((entry) => (
              <Card key={entry.day} className="gap-0 rounded-lg border-stone-200 bg-white p-4">
                <div className="mb-4">
                  <p className="font-bold">{entry.day}</p>
                  <p className="mt-1 text-sm text-stone-500">{entry.context}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {mealSlots.map((slot) => {
                    const planMeal = entry.meals.find((meal) => meal.slot === slot);
                    const meal = getMealById(planMeal?.mealId ?? "m1", customRecipes);

                    return (
                      <div key={slot} className="rounded-lg bg-stone-50 p-3">
                        <p className="text-xs font-semibold uppercase text-stone-500">{slotLabels[slot]}</p>
                        <button type="button" onClick={() => onSelectMeal(meal.id)} className="mt-2 w-full text-left">
                          <p className="font-semibold leading-5">
                            {meal.image} {meal.name}
                          </p>
                          <p className="mt-1 text-sm text-stone-500">
                            {meal.time} mins - {money(meal.price)}
                          </p>
                        </button>
                        <AppButton variant="secondary" className="mt-3 w-full justify-center px-3 py-2 text-xs" onClick={() => { track("meal_swap_started", { day: entry.day, meal_slot: slot, meal_id: meal.id, layout: "mobile" }); setRescueChoice({ day: entry.day, slot }); }}>
                          <RefreshCcw size={15} /> Change meal
                        </AppButton>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <BudgetCard plan={plan} customRecipes={customRecipes} budget={prefs.budget} />
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4">
            <p className="font-semibold">Weekly balance</p>
            <p className="mt-2 text-sm text-stone-500">{weeklyBalanceSummary(plan, customRecipes)} Signals are broad checks, not calorie targets.</p>
          </Card>
        </div>
      </div>
      {rescueChoice && originalMeal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/40 p-0 sm:items-center sm:p-5">
          <Card className="w-full max-w-lg gap-0 rounded-t-lg bg-white p-6 shadow-2xl sm:rounded-lg">
            {browseMode ? (
              <>
                <div className="flex justify-between">
                  <div>
                    <Badge tone="amber">{slotLabels[rescueChoice.slot]}</Badge>
                    <h2 className="mt-3 text-2xl font-bold">Choose a different meal</h2>
                  </div>
                  <button type="button" aria-label="Close option chooser" onClick={() => { track("meal_swap_cancelled", { action: "close", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeModal(); }} className="h-fit rounded-lg p-2 hover:bg-stone-100">
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-2 text-stone-600">Your saved recipes and other suitable options for this slot.</p>
                <div className="mt-5 max-h-80 space-y-3 overflow-y-auto">
                  {browseOptions.length > 0 ? (
                    browseOptions.map((meal) => (
                      <div key={meal.id} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold">{meal.image} {meal.name}</p>
                            <p className="mt-1 text-sm text-stone-500">{meal.source} · {meal.time} min · {money(meal.price)}</p>
                          </div>
                          <AppButton className="shrink-0" onClick={() => { track("meal_swap_browse_option_selected", { day: rescueChoice.day, meal_slot: rescueChoice.slot, meal_id: meal.id }); confirmSwapWith(meal, "browse"); }}>
                            Use
                          </AppButton>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">No alternatives found for your restrictions.</p>
                  )}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <AppButton variant="secondary" className="flex-1" onClick={() => setBrowseMode(false)}>
                    <ArrowLeft size={15} /> Back
                  </AppButton>
                  <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_discover_clicked", { day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeModal(); setScreen("discover"); }}>
                    Find more on Discover
                  </AppButton>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <div>
                    <Badge tone="amber">{slotLabels[rescueChoice.slot]}</Badge>
                    <h2 className="mt-3 text-2xl font-bold">Change this meal</h2>
                  </div>
                  <button type="button" aria-label="Close option chooser" onClick={() => { track("meal_swap_cancelled", { action: "close", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeModal(); }} className="h-fit rounded-lg p-2 hover:bg-stone-100">
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-2 text-stone-600">Switch this slot without changing the rest of your week. The planner keeps your budget and restrictions in view.</p>
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
                  {replacement && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-semibold uppercase text-emerald-700">Suggested suitable option</p>
                      <div className="mt-2 flex justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {replacement.image} {replacement.name}
                          </p>
                          <p className="mt-1 text-sm text-stone-600">{replacement.source}</p>
                        </div>
                        <p className="whitespace-nowrap text-sm">
                          {replacement.time} min - {money(replacement.price)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {replacement && (
                  <div className="mt-5 rounded-lg bg-stone-900 p-4 text-sm text-white">
                    <p>
                      <strong>{Math.max(0, originalMeal.time - replacement.time)} minutes saved.</strong> Plan total after this change: {money(newTotal)}.
                    </p>
                    <p className="mt-1 text-stone-300">{prefs.budget - newTotal >= 0 ? `${money(prefs.budget - newTotal)} remains in your weekly budget.` : `This would put the plan ${money(newTotal - prefs.budget)} over budget.`}</p>
                  </div>
                )}
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_cancelled", { action: "keep_original", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeModal(); }}>
                    Keep original
                  </AppButton>
                  <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_browse_clicked", { day: rescueChoice.day, meal_slot: rescueChoice.slot }); setBrowseMode(true); }}>
                    Browse options
                  </AppButton>
                  <AppButton className="flex-1" onClick={confirmSwap} disabled={!replacement}>
                    Use suggested meal
                  </AppButton>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
