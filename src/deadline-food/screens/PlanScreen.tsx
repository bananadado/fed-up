import { ChevronDown, Clock3, Flame, Heart, Layers, RefreshCcw, ShoppingBag, ShoppingBasket, Sparkles, Soup, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { mealSlots } from "../data";
import type { Meal, MealSlot, PlanEntry, PlanRegenMode, Preferences, Screen } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { AppButton, Badge } from "../components/primitives";
import { SwapModal, slotLabels } from "../components/SwapModal";
import { groceryVendorById, groceryVendors, ingredientsFromPlan } from "../shopping";
import { getMealById, money } from "../utils";
import { mealHealthSignals } from "../healthSignals";
import type { TrackEvent } from "../analytics";

type RescueChoice = {
  day: string;
  slot: MealSlot;
} | null;

function dailyTotals(entry: PlanEntry, customRecipes: Meal[]) {
  return entry.meals.reduce(
    (sum, planMeal) => {
      const { nutrition } = getMealById(planMeal.mealId, customRecipes);
      return {
        calories: sum.calories + nutrition.calories,
        protein: sum.protein + nutrition.protein,
        carbs: sum.carbs + nutrition.carbs,
        fat: sum.fat + nutrition.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function planMealReason(planMeal: PlanEntry["meals"][number], repeatedBreakfastIds: Set<string>) {
  if (planMeal.batchCook) return "Batch cook: covers later busy meals.";
  if (planMeal.leftoverOf) return "Leftovers from earlier batch cook.";
  if (planMeal.slot === "breakfast" && repeatedBreakfastIds.has(planMeal.mealId)) return "Repeated breakfast to reduce decisions.";
  return null;
}

export function PlanScreen({
  plan,
  setPlan,
  prefs,
  customRecipes,
  discoverSaved,
  setScreen,
  onSelectMeal,
  planStale,
  planGenerated,
  regenerating,
  onRegenerate,
  regenMode,
  openDiscover,
  track,
  calendarWarning,
}: {
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  prefs: Preferences;
  customRecipes: Meal[];
  discoverSaved: Meal[];
  setScreen: (screen: Screen) => void;
  onSelectMeal: (mealId: string) => void;
  planStale: boolean;
  planGenerated: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  regenMode: PlanRegenMode;
  openDiscover: (day: string, slot: MealSlot, mealId: string) => void;
  track: TrackEvent;
  calendarWarning?: string;
}) {
  const [rescueChoice, setRescueChoice] = useState<RescueChoice>(() => {
    try {
      const saved = sessionStorage.getItem("deadlineFood:pendingRescueChoice");
      if (saved) {
        sessionStorage.removeItem("deadlineFood:pendingRescueChoice");
        return JSON.parse(saved) as RescueChoice;
      }
    } catch { /* sessionStorage unavailable */ }
    return null;
  });
  const [addToPlanMealId, setAddToPlanMealId] = useState<string | null>(() => {
    try {
      const saved = sessionStorage.getItem("deadlineFood:addToPlanMealId");
      if (saved) { sessionStorage.removeItem("deadlineFood:addToPlanMealId"); return saved; }
    } catch { /* sessionStorage unavailable */ }
    return null;
  });
  const [swapSuggestedMealId, setSwapSuggestedMealId] = useState<string | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(() => {
    try {
      if (sessionStorage.getItem("deadlineFood:openShopping") === "1") {
        sessionStorage.removeItem("deadlineFood:openShopping");
        return true;
      }
    } catch { /* sessionStorage unavailable */ }
    return false;
  });
  const [shoppingVendorId, setShoppingVendorId] = useState(groceryVendors[0].id);
  const shoppingItems = useMemo(() => ingredientsFromPlan(plan, customRecipes, prefs.availableIngredients, prefs.unitSystem), [plan, customRecipes, prefs.availableIngredients, prefs.unitSystem]);
  const planSummary = useMemo(() => {
    const breakfastCounts = new Map<string, number>();
    const ingredientCounts = new Map<string, number>();
    let batchCooks = 0;
    let leftoverMeals = 0;

    for (const entry of plan) {
      for (const planMeal of entry.meals) {
        if (planMeal.batchCook) batchCooks += 1;
        if (planMeal.leftoverOf) leftoverMeals += 1;
        if (planMeal.slot === "breakfast") {
          breakfastCounts.set(planMeal.mealId, (breakfastCounts.get(planMeal.mealId) ?? 0) + 1);
        }
        if (!planMeal.leftoverOf) {
          const meal = getMealById(planMeal.mealId, customRecipes);
          for (const ingredient of meal.ingredients) {
            const key = ingredient.name.trim().toLowerCase();
            if (key) ingredientCounts.set(key, (ingredientCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }

    const repeatedBreakfastIds = new Set([...breakfastCounts].filter(([, count]) => count > 1).map(([mealId]) => mealId));
    const repeatedBreakfasts = [...breakfastCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    const reusedIngredientGroups = [...ingredientCounts.values()].filter((count) => count > 1).length;

    return { batchCooks, leftoverMeals, repeatedBreakfasts, reusedIngredientGroups, repeatedBreakfastIds };
  }, [plan, customRecipes]);

  const weeks = useMemo(() => {
    const chunks: PlanEntry[][] = [];
    for (let i = 0; i < plan.length; i += 7) chunks.push(plan.slice(i, i + 7));
    return chunks;
  }, [plan]);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set());
  const toggleWeek = (index: number) =>
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });

  function handleRegenerate() {
    track("auto_plan_regenerate_clicked", { source: "plan", stale: planStale });
    onRegenerate();
  }

  return (
    <div>
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Planned meals</h1>
          <p className="mt-2 text-stone-600">Built from your saved recipes and how busy your calendar looks.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton variant="secondary" onClick={() => { track("find_alternatives_clicked", { source_screen: "plan" }); setScreen("recipes"); }}>
            <Heart size={16} /> Find alternatives
          </AppButton>
          <AppButton onClick={handleRegenerate} disabled={regenerating}>
            <Sparkles size={16} /> {regenerating ? "Building plan…" : planGenerated ? "Regenerate plan" : "Generate plan"}
          </AppButton>
        </div>
      </div>

      {planStale && regenMode === "prompt" && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-emerald-100 p-1.5 text-emerald-700">
              <Sparkles size={16} />
            </span>
            <p className="text-sm leading-6 text-emerald-900">
              {planGenerated
                ? "Your calendar, saved recipes or settings changed. Regenerate to keep this plan in step with your week."
                : "Generate a plan from your saved recipes and calendar to replace these sample meals."}
            </p>
          </div>
          <AppButton className="shrink-0 justify-center" onClick={handleRegenerate} disabled={regenerating}>
            <Sparkles size={16} /> {regenerating ? "Building plan…" : planGenerated ? "Regenerate plan" : "Generate plan"}
          </AppButton>
        </div>
      )}

      {calendarWarning && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Calendar not connected</p>
          <p className="mt-1 text-sm text-amber-800">{calendarWarning}</p>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Batch cooks", value: planSummary.batchCooks },
          { label: "Leftover meals", value: planSummary.leftoverMeals },
          { label: "Repeated breakfasts", value: planSummary.repeatedBreakfasts },
          { label: "Reused ingredients", value: planSummary.reusedIngredientGroups },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-stone-200 bg-white px-4 py-3">
            <p className="text-2xl font-bold text-stone-950">{item.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase text-stone-500">{item.label}</p>
          </div>
        ))}
      </div>

      {addToPlanMealId && (() => {
        const meal = discoverSaved.find((m) => m.id === addToPlanMealId) ?? getMealById(addToPlanMealId, customRecipes);
        return (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-900">
              <span className="font-semibold">{meal.image} {meal.name}</span>
              {" "}— tap <strong>Change</strong> on any meal to assign it to that slot.
            </p>
            <button type="button" onClick={() => setAddToPlanMealId(null)} className="shrink-0 rounded-lg p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        );
      })()}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          {weeks.map((weekEntries, weekIndex) => {
            const collapsed = collapsedWeeks.has(weekIndex);
            const rangeStart = weekEntries[0]?.day;
            const rangeEnd = weekEntries[weekEntries.length - 1]?.day;
            const showWeekHeader = weeks.length > 1;

            return (
              <div key={weekIndex} className="space-y-3">
                {showWeekHeader && (
                  <button
                    type="button"
                    onClick={() => { track("plan_week_toggled", { week: weekIndex + 1, collapsed: !collapsed }); toggleWeek(weekIndex); }}
                    className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-stone-300"
                  >
                    <div>
                      <p className="font-bold">Week {weekIndex + 1}</p>
                      <p className="text-sm text-stone-500">{rangeStart}{rangeEnd && rangeEnd !== rangeStart ? ` – ${rangeEnd}` : ""}</p>
                    </div>
                    <ChevronDown size={18} className={`text-stone-400 transition ${collapsed ? "-rotate-90" : ""}`} />
                  </button>
                )}

                {!collapsed && (
                  <>
                    <div className="hidden overflow-hidden rounded-lg border border-stone-200 bg-white md:block">
                      <div className="grid grid-cols-[minmax(100px,0.55fr)_repeat(3,minmax(0,1fr))] border-b border-stone-200 bg-stone-50 text-sm font-semibold text-stone-600">
                        <div className="px-4 py-3">
                          <span>Day</span>
                          <p className="mt-0.5 text-[10px] font-normal text-stone-400">broad nutrition signal</p>
                        </div>
                        {mealSlots.map((slot) => (
                          <div key={slot} className="border-l border-stone-200 px-4 py-3">
                            {slotLabels[slot]}
                          </div>
                        ))}
                      </div>
                      {weekEntries.map((entry) => (
                        <div key={entry.day} className="grid grid-cols-[minmax(100px,0.55fr)_repeat(3,minmax(0,1fr))] border-b border-stone-200 last:border-b-0">
                          <div className="bg-stone-50 px-4 py-4">
                            <p className="font-bold">{entry.day}</p>
                            {entry.context && <p className="mt-1 text-xs leading-5 text-stone-500">{entry.context}</p>}
                            {(() => { const t = dailyTotals(entry, customRecipes); return (
                              <div className="mt-3 space-y-0.5">
                                <p className="text-xs font-semibold text-stone-700">{t.calories} kcal</p>
                                <p className="text-xs text-stone-500">{t.protein}g protein</p>
                                <p className="text-[11px] text-stone-400">{t.carbs}g carbs · {t.fat}g fat</p>
                              </div>
                            ); })()}
                          </div>
                          {mealSlots.map((slot) => {
                            const planMeal = entry.meals.find((meal) => meal.slot === slot);
                            const meal = planMeal ? getMealById(planMeal.mealId, customRecipes) : null;

                            return (
                              <div key={slot} className="border-l border-stone-200 p-3">
                                <div className="flex h-full min-h-[178px] flex-col justify-between rounded-lg bg-stone-50 p-3 transition hover:bg-emerald-50 hover:ring-1 hover:ring-emerald-200">
                                  {meal ? (
                                    <button
                                      type="button"
                                      onClick={() => { track("meal_card_view_clicked", { day: entry.day, meal_slot: slot, meal_id: meal.id, source: "plan_desktop" }); onSelectMeal(meal.id); }}
                                      className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        {planMeal?.rescued && <Badge tone="blue">Rescued</Badge>}
                                        {planMeal?.batchCook && <Badge tone="green"><Soup size={11} className="mr-1 inline" />Batch cook</Badge>}
                                        {planMeal?.leftoverOf && <Badge tone="blue"><Layers size={11} className="mr-1 inline" />Leftovers</Badge>}
                                        <Badge tone={meal.type === "fallback" ? "amber" : meal.type === "cook" ? "green" : "neutral"}>
                                          {meal.type === "fallback" ? <><ShoppingBag size={11} className="mr-1 inline" />Easy option</> : meal.type === "cook" ? <><Flame size={11} className="mr-1 inline" />Cook</> : <><Layers size={11} className="mr-1 inline" />Remix</>}
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
                                      {planMeal && planMealReason(planMeal, planSummary.repeatedBreakfastIds) && (
                                        <p className="mt-2 text-xs font-medium text-emerald-700">{planMealReason(planMeal, planSummary.repeatedBreakfastIds)}</p>
                                      )}
                                    </button>
                                  ) : (
                                    <div>
                                      <Badge tone="amber">Unfilled</Badge>
                                      <p className="mt-3 text-sm font-semibold leading-5 text-stone-700">No meal allocated</p>
                                      <p className="mt-2 text-sm text-stone-500">Choose a meal for this slot.</p>
                                    </div>
                                  )}
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <AppButton aria-label="Change meal" variant="secondary" className="flex-1 justify-center px-3 py-2 text-xs" onClick={() => { track("meal_swap_started", { day: entry.day, meal_slot: slot, meal_id: meal?.id ?? null, layout: "desktop" }); track("meal_card_swap_clicked", { day: entry.day, meal_slot: slot, meal_id: meal?.id ?? null, source: "plan_desktop" }); if (addToPlanMealId) setSwapSuggestedMealId(addToPlanMealId); setRescueChoice({ day: entry.day, slot }); }}>
                                      <RefreshCcw size={15} /> {meal ? "Change" : "Choose"}
                                    </AppButton>
                                    {meal && (
                                      <AppButton variant="ghost" className="flex-1 justify-center px-3 py-2 text-xs" onClick={() => openDiscover(entry.day, slot, meal.id)}>
                                        Find something else
                                      </AppButton>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4 md:hidden">
                      {weekEntries.map((entry) => (
                        <Card key={entry.day} className="gap-0 rounded-lg border-stone-200 bg-white p-4">
                          {(() => { const t = dailyTotals(entry, customRecipes); return (
                            <div className="mb-4 flex items-start justify-between gap-3">
                              <div>
                                <p className="font-bold">{entry.day}</p>
                                {entry.context && <p className="mt-1 text-xs leading-5 text-stone-500">{entry.context}</p>}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-semibold text-stone-700">{t.calories} kcal</p>
                                <p className="text-xs text-stone-500">{t.protein}g protein</p>
                                <p className="text-[11px] text-stone-400">{t.carbs}g carbs · {t.fat}g fat</p>
                              </div>
                            </div>
                          ); })()}
                          <div className="grid gap-3 sm:grid-cols-3">
                            {mealSlots.map((slot) => {
                              const planMeal = entry.meals.find((meal) => meal.slot === slot);
                              const meal = planMeal ? getMealById(planMeal.mealId, customRecipes) : null;

                              return (
                                <div key={slot} className="rounded-lg bg-stone-50 p-3 transition hover:bg-emerald-50 hover:ring-1 hover:ring-emerald-200">
                                  <p className="text-xs font-semibold uppercase text-stone-500">{slotLabels[slot]}</p>
                                  {meal ? (
                                    <button type="button" onClick={() => { track("meal_card_view_clicked", { day: entry.day, meal_slot: slot, meal_id: meal.id, source: "plan_mobile" }); onSelectMeal(meal.id); }} className="mt-2 w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                                      <p className="break-words font-semibold leading-5">
                                        {meal.image} {meal.name}
                                      </p>
                                      <p className="mt-1 text-sm text-stone-500">
                                        {meal.time} mins - {money(meal.price)}
                                      </p>
                                    </button>
                                  ) : (
                                    <div className="mt-2">
                                      <p className="break-words font-semibold leading-5 text-stone-700">No meal allocated</p>
                                      <p className="mt-1 text-sm text-stone-500">Choose a meal for this slot.</p>
                                    </div>
                                  )}
                                  {(planMeal?.batchCook || planMeal?.leftoverOf) && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {planMeal?.batchCook && <Badge tone="green"><Soup size={11} className="mr-1 inline" />Batch cook</Badge>}
                                      {planMeal?.leftoverOf && <Badge tone="blue"><Layers size={11} className="mr-1 inline" />Leftovers</Badge>}
                                    </div>
                                  )}
                                  {planMeal && planMealReason(planMeal, planSummary.repeatedBreakfastIds) && (
                                    <p className="mt-2 text-xs font-medium text-emerald-700">{planMealReason(planMeal, planSummary.repeatedBreakfastIds)}</p>
                                  )}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <AppButton aria-label="Change meal" variant="secondary" className="flex-1 justify-center px-3 py-2 text-xs" onClick={() => { track("meal_swap_started", { day: entry.day, meal_slot: slot, meal_id: meal?.id ?? null, layout: "mobile" }); track("meal_card_swap_clicked", { day: entry.day, meal_slot: slot, meal_id: meal?.id ?? null, source: "plan_mobile" }); if (addToPlanMealId) setSwapSuggestedMealId(addToPlanMealId); setRescueChoice({ day: entry.day, slot }); }}>
                                      <RefreshCcw size={15} /> {meal ? "Change" : "Choose"}
                                    </AppButton>
                                    {meal && (
                                      <AppButton variant="ghost" className="flex-1 justify-center px-3 py-2 text-xs" onClick={() => openDiscover(entry.day, slot, meal.id)}>
                                        Find alt.
                                      </AppButton>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="space-y-4">
          <BudgetCard plan={plan} customRecipes={customRecipes} budget={prefs.budget} />
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
          <div className="animate-fade-in fixed inset-0 z-40 bg-stone-950/40" onClick={() => setShoppingOpen(false)} />
          <div className="animate-slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:max-w-md">
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
      {rescueChoice && (
        <SwapModal
          rescueChoice={rescueChoice}
          onClose={() => { setRescueChoice(null); setSwapSuggestedMealId(null); setAddToPlanMealId(null); }}
          plan={plan}
          setPlan={setPlan}
          prefs={prefs}
          customRecipes={customRecipes}
          savedRecipes={discoverSaved}
          onSelectMeal={onSelectMeal}
          suggestedMealId={swapSuggestedMealId ?? undefined}
          track={track}
        />
      )}
    </div>
  );
}
