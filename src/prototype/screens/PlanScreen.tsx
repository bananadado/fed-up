import { ArrowLeft, Clock3, Heart, RefreshCcw, ShoppingBasket, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { mealSlots, seedMeals } from "../data";
import type { Meal, MealSlot, PlanEntry, Preferences, Screen } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { AppButton, Badge } from "../components/primitives";
import { ingredientName } from "../ingredients";
import { groceryVendorById, groceryVendors, ingredientsFromPlan } from "../shopping";
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

function priceDiff(newPrice: number, oldPrice: number) {
  const diff = newPrice - oldPrice;
  if (Math.abs(diff) < 0.005) return { label: "same price", sign: "neutral" as const };
  return diff < 0
    ? { label: `saves ${money(Math.abs(diff))}`, sign: "saving" as const }
    : { label: `costs ${money(diff)} more`, sign: "extra" as const };
}

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
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingVendorId, setShoppingVendorId] = useState(groceryVendors[0].id);
  const shoppingItems = useMemo(() => ingredientsFromPlan(plan, customRecipes, prefs.availableIngredients), [plan, customRecipes, prefs.availableIngredients]);
  const originalDay = rescueChoice ? plan.find((entry) => entry.day === rescueChoice.day) : null;
  const originalPlanMeal = originalDay && rescueChoice ? originalDay.meals.find((meal) => meal.slot === rescueChoice.slot) : null;
  const originalMeal = originalPlanMeal ? getMealById(originalPlanMeal.mealId, customRecipes) : null;
  const avoided = [...prefs.dislikes, ...prefs.allergens].map((value) => value.toLowerCase());
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
  const directOptions = browseOptions.slice(0, 2);
  const replacement = directOptions[0];
  const total = plan.reduce(
    (sum, entry) => sum + entry.meals.reduce((daySum, meal) => daySum + getMealById(meal.mealId, customRecipes).price, 0),
    0,
  );
  const newTotal = originalMeal && replacement ? total - originalMeal.price + replacement.price : total;

  function planTotalAfter(meal: Meal) {
    return originalMeal ? total - originalMeal.price + meal.price : total;
  }

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
        <AppButton variant="secondary" onClick={() => { track("find_alternatives_clicked", { source_screen: "plan" }); setScreen("recipes"); }}>
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
                          <p className="mt-3 break-words text-sm font-semibold leading-5">
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
                          <p className="break-words font-semibold leading-5">
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
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <ShoppingBasket size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Shopping list</p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {shoppingItems.length === 0 ? "No items yet" : `${shoppingItems.length} items this week`}
                </p>
              </div>
              <AppButton
                type="button"
                variant="secondary"
                className="shrink-0 px-3 py-1.5 text-xs"
                onClick={() => setShoppingOpen(true)}
                disabled={shoppingItems.length === 0}
              >
                View list
              </AppButton>
            </div>
          </Card>
        </div>
      </div>
      {shoppingOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-stone-950/40" onClick={() => setShoppingOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:max-w-md">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <h2 className="font-bold">Shopping list</h2>
              <button type="button" onClick={() => setShoppingOpen(false)} aria-label="Close shopping list" className="rounded-lg p-2 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ShoppingListCard
                title="Shopping list"
                description="Ingredients still needed across your planned meals for the week."
                items={shoppingItems}
                selectedVendor={groceryVendorById(shoppingVendorId)}
                vendors={groceryVendors}
                onSelectVendor={setShoppingVendorId}
                onOpenIngredient={(ingredient) => {
                  track("vendor_shopping_item_opened", { ingredient, vendor: shoppingVendorId, source: "plan" });
                  window.open(groceryVendorById(shoppingVendorId).searchUrl(ingredient), "_blank", "noopener");
                }}
                onCopy={() => track("vendor_shopping_list_copied", { vendor: shoppingVendorId, item_count: shoppingItems.length, source: "plan" })}
                onToggleItem={(ingredient, checked, checkedCount, itemCount) => track("vendor_shopping_item_toggled", { ingredient, checked, checked_count: checkedCount, item_count: itemCount, source: "plan" })}
                storageKey="deadline-food:plan-shopping-list"
              />
            </div>
          </div>
        </>
      )}
      {rescueChoice && originalMeal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/40 p-0 sm:items-center sm:p-5">
          <Card className="w-full max-w-lg gap-0 overflow-y-auto rounded-t-lg bg-white p-6 shadow-2xl max-h-[90dvh] sm:rounded-lg">
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
                            <p className="break-words font-semibold">{meal.image} {meal.name}</p>
                            <p className="mt-1 text-sm text-stone-500">{meal.source} · {meal.time} min · {money(meal.price)} · {priceDiff(meal.price, originalMeal?.price ?? 0).label}</p>
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
                  <AppButton variant="secondary" className="flex-1" onClick={() => { track("meal_swap_discover_clicked", { day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeModal(); setScreen("recipes"); }}>
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
                  <button type="button" aria-label="Close option chooser" onClick={() => { track("meal_swap_cancelled", { action: "close", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeModal(); }} className="h-fit rounded-lg p-2 hover:bg-stone-100">
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
                  {replacement && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-semibold uppercase text-emerald-700">Suggested suitable option</p>
                      <div className="mt-3">
                        <div className="rounded-lg bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words font-semibold">
                                  {replacement.image} {replacement.name}
                                </p>
                                <Badge tone="green">Suggested</Badge>
                              </div>
                              <p className="mt-1 text-sm text-stone-600">{replacement.source}</p>
                              <p className="mt-1 text-xs text-stone-500">
                                {replacement.time} min - {money(replacement.price)} · {priceDiff(replacement.price, originalMeal.price).label} · total {money(planTotalAfter(replacement))} · {prefs.budget - planTotalAfter(replacement) >= 0 ? `${money(prefs.budget - planTotalAfter(replacement))} left` : `${money(Math.abs(prefs.budget - planTotalAfter(replacement)))} over`}
                              </p>
                            </div>
                            <AppButton className="shrink-0" onClick={() => confirmSwapWith(replacement, "suggested")}>
                              Use
                            </AppButton>
                          </div>
                        </div>
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
