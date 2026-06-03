import { Clock3, Flame, Heart, Layers, RefreshCcw, ShoppingBag, ShoppingBasket, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { mealSlots } from "../data";
import type { MealSlot, PlanEntry, Preferences, Screen, Meal } from "../types";
import { BudgetCard } from "../components/BudgetCard";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { AppButton, Badge } from "../components/primitives";
import { SwapModal, slotLabels } from "../components/SwapModal";
import { groceryVendorById, groceryVendors, ingredientsFromPlan } from "../shopping";
import { getMealById, money } from "../utils";
import { mealHealthSignals } from "../healthSignals";
import type { TrackPrototypeEvent } from "../analytics";

type RescueChoice = {
  day: string;
  slot: MealSlot;
} | null;

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
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingVendorId, setShoppingVendorId] = useState(groceryVendors[0].id);
  const shoppingItems = useMemo(() => ingredientsFromPlan(plan, customRecipes, prefs.availableIngredients), [plan, customRecipes, prefs.availableIngredients]);

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
                              {meal.type === "fallback" ? <><ShoppingBag size={11} className="mr-1 inline" />Fallback</> : meal.type === "cook" ? <><Flame size={11} className="mr-1 inline" />Cook</> : <><Layers size={11} className="mr-1 inline" />Remix</>}
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
