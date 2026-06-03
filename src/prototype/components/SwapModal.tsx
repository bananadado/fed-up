import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { getRecipeCatalogue } from "../recipeCatalogue";
import type { Meal, MealSlot, PlanEntry, Preferences, Screen } from "../types";
import { ingredientName } from "../ingredients";
import { getMealById, money } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";
import { AppButton, Badge } from "./primitives";

export const slotLabels: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function priceDiff(newPrice: number, oldPrice: number) {
  const diff = newPrice - oldPrice;
  if (Math.abs(diff) < 0.005) return { label: "same price", sign: "neutral" as const };
  return diff < 0
    ? { label: `saves ${money(Math.abs(diff))}`, sign: "saving" as const }
    : { label: `costs ${money(diff)} more`, sign: "extra" as const };
}

export function SwapModal({
  rescueChoice,
  onClose,
  plan,
  setPlan,
  prefs,
  customRecipes,
  setScreen,
  track,
}: {
  rescueChoice: { day: string; slot: MealSlot };
  onClose: () => void;
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  prefs: Preferences;
  customRecipes: Meal[];
  setScreen: (screen: Screen) => void;
  track: TrackPrototypeEvent;
}) {
  const [browseMode, setBrowseMode] = useState(false);

  const originalDay = plan.find((entry) => entry.day === rescueChoice.day);
  const originalPlanMeal = originalDay?.meals.find((meal) => meal.slot === rescueChoice.slot);
  const originalMeal = originalPlanMeal ? getMealById(originalPlanMeal.mealId, customRecipes) : null;
  const avoided = [...prefs.dislikes, ...prefs.allergens].map((value) => value.toLowerCase());
  const browseOptions = [...customRecipes, ...getRecipeCatalogue().filter((m) => !customRecipes.some((c) => c.id === m.id))]
    .filter((meal) => meal.mealSlots.includes(rescueChoice.slot))
    .filter((meal) => meal.id !== originalPlanMeal?.mealId)
    .filter((meal) => !meal.ingredients.some((ingredient) => avoided.includes(ingredientName(ingredient).toLowerCase())))
    .filter((meal) => !meal.allergens.some((allergen) => avoided.includes(allergen.toLowerCase())))
    .sort((a, b) => {
      const aScore = a.tags.filter((tag) => prefs.likes.some((like) => like.toLowerCase() === tag.toLowerCase())).length;
      const bScore = b.tags.filter((tag) => prefs.likes.some((like) => like.toLowerCase() === tag.toLowerCase())).length;
      return bScore - aScore || a.time - b.time || a.price - b.price;
    });
  const directOptions = browseOptions.slice(0, 2);
  const replacement = directOptions[0];
  const total = plan.reduce(
    (sum, entry) => sum + entry.meals.reduce((daySum, meal) => daySum + getMealById(meal.mealId, customRecipes).price, 0),
    0,
  );
  const newTotal = originalMeal && replacement ? total - originalMeal.price + replacement.price : total;

  if (!originalMeal) return null;

  function planTotalAfter(meal: Meal) {
    return originalMeal ? total - originalMeal.price + meal.price : total;
  }

  function closeAndReset() {
    setBrowseMode(false);
    onClose();
  }

  function confirmSwapWith(meal: Meal, source: "suggested" | "browse") {
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
    closeAndReset();
  }

  function confirmSwap() {
    if (!replacement) return;
    confirmSwapWith(replacement, "suggested");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/40 p-0 sm:items-center sm:p-5">
      <Card className="w-full max-w-lg gap-0 overflow-y-auto rounded-t-lg bg-white p-6 shadow-2xl max-h-[90dvh] sm:rounded-lg">
        {browseMode ? (
          <>
            <div className="flex justify-between">
              <div>
                <Badge tone="amber">{slotLabels[rescueChoice.slot]}</Badge>
                <h2 className="mt-3 text-2xl font-bold">Choose a different meal</h2>
              </div>
              <button type="button" aria-label="Close option chooser" onClick={() => { track("meal_swap_cancelled", { action: "close", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); }} className="h-fit rounded-lg p-2 hover:bg-stone-100">
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
                        <p className="break-words font-semibold">{meal.image} {meal.name}</p>
                        <p className="mt-1 text-sm text-stone-500">{meal.source} · {meal.time} min · {money(meal.price)} · {priceDiff(meal.price, originalMeal.price).label}</p>
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
              <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_discover_clicked", { day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); setScreen("recipes"); }}>
                Find more on Recipes
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
              <button type="button" aria-label="Close option chooser" onClick={() => { track("meal_swap_cancelled", { action: "close", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); }} className="h-fit rounded-lg p-2 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <p className="mt-2 text-stone-600">Your budget and restrictions stay in view as you choose.</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-lg bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase text-stone-500">Original</p>
                <div className="mt-2 flex justify-between gap-3">
                  <p className="break-words font-semibold">{originalMeal.name}</p>
                  <p className="text-sm">
                    {originalMeal.time} min - {money(originalMeal.price)}
                  </p>
                </div>
              </div>
              {directOptions.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase text-emerald-700">Suggested suitable options</p>
                  <div className="mt-3 space-y-3">
                    {directOptions.map((meal, index) => {
                      const optionTotal = planTotalAfter(meal);
                      const optionRemaining = prefs.budget - optionTotal;

                      return (
                        <div key={meal.id} className="rounded-lg bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words font-semibold">
                                  {meal.image} {meal.name}
                                </p>
                                {index === 0 && <Badge tone="green">Best fit</Badge>}
                              </div>
                              <p className="mt-1 text-sm text-stone-600">{meal.source}</p>
                              <p className="mt-1 text-xs text-stone-500">
                                {meal.time} min - {money(meal.price)} · {priceDiff(meal.price, originalMeal.price).label} · total {money(optionTotal)} · {optionRemaining >= 0 ? `${money(optionRemaining)} left` : `${money(Math.abs(optionRemaining))} over`}
                              </p>
                            </div>
                            <AppButton className="shrink-0" onClick={() => confirmSwapWith(meal, "suggested")}>
                              Use
                            </AppButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {replacement && (
              <div className="mt-5 rounded-lg bg-stone-900 p-4 text-center text-sm text-white">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-stone-400">Current plan</p>
                    <p className="mt-1 font-semibold">{money(total)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-stone-400">After best fit</p>
                    <p className="mt-1 font-semibold">{money(newTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-stone-400">Budget left</p>
                    <p className="mt-1 font-semibold">{prefs.budget - newTotal >= 0 ? money(prefs.budget - newTotal) : `${money(newTotal - prefs.budget)} over`}</p>
                  </div>
                </div>
                <p className="mt-3 text-stone-300">
                  {originalMeal.time - replacement.time > 0 ? (
                    <>Best fit saves <strong className="text-white">{originalMeal.time - replacement.time} minutes</strong> compared with the original.</>
                  ) : originalMeal.time - replacement.time < 0 ? (
                    <>Best fit takes <strong className="text-white">{replacement.time - originalMeal.time} minutes longer</strong> than the original.</>
                  ) : (
                    <>Best fit takes the same time as the original.</>
                  )}
                  {" "}
                  {(() => {
                    const diff = priceDiff(replacement.price, originalMeal.price);
                    return diff.sign === "saving" ? (
                      <>You've <strong className="text-white">saved {money(Math.abs(replacement.price - originalMeal.price))}</strong> on this meal.</>
                    ) : diff.sign === "extra" ? (
                      <>You've <strong className="text-white">spent {money(replacement.price - originalMeal.price)} more</strong> on this meal.</>
                    ) : (
                      <>This meal costs the same.</>
                    );
                  })()}
                </p>
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_cancelled", { action: "keep_original", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); }}>
                Keep original
              </AppButton>
              <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_browse_clicked", { day: rescueChoice.day, meal_slot: rescueChoice.slot }); setBrowseMode(true); }}>
                Browse options
              </AppButton>
              <AppButton className="flex-1" onClick={confirmSwap} disabled={!replacement}>
                Use suggested
              </AppButton>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
