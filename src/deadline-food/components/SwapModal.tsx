import { ArrowUpDown, BadgeCheck, Clock3, Eye, Layers, PiggyBank, Search, ShoppingBag, ShoppingCart, Flame, SlidersHorizontal, Sparkles, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import type { Deadline, Meal, MealSlot, PlanEntry, Preferences } from "../types";
import { fetchRecommenderRecommendations } from "../recommenderApi";
import { ingredientName } from "../ingredients";
import { isMealDietaryCompatible, isVerified, mealById, money } from "../utils";
import type { TrackEvent } from "../analytics";
import { MealThumbnail } from "./MealThumbnail";
import { registerPlanMeals } from "../recipeCatalogue";
import { AppButton, Badge } from "./primitives";

export const slotLabels: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export const mealTypeIcon: Record<string, React.ElementType> = {
  cook: Flame,
  fallback: ShoppingBag,
  remix: Layers,
};

type SortOption = "match" | "quickest" | "cheapest" | "fewest-ingredients" | "easiest";

const sortLabels: Record<SortOption, string> = {
  match: "Recommended for you",
  quickest: "Quickest",
  cheapest: "Cheapest",
  "fewest-ingredients": "Fewest ingredients",
  easiest: "Easiest",
};

const allSlots: MealSlot[] = ["breakfast", "lunch", "dinner"];

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
  savedRecipes,
  onSelectMeal,
  suggestedMealId,
  deletedRecipeIds,
  sessionId,
  deadlines,
  onGoToDiscover,
  track,
}: {
  rescueChoice: { day: string; slot: MealSlot };
  onClose: () => void;
  plan: PlanEntry[];
  setPlan: (plan: PlanEntry[]) => void;
  prefs: Preferences;
  customRecipes: Meal[];
  savedRecipes?: Meal[];
  onSelectMeal: (mealId: string) => void;
  suggestedMealId?: string;
  deletedRecipeIds?: Set<string>;
  sessionId: string;
  deadlines: Deadline[];
  onGoToDiscover?: () => void;
  track: TrackEvent;
}) {
  const [savedFilters] = useState(() => {
    try {
      const raw = sessionStorage.getItem("deadlineFood:swapFilters");
      if (raw) {
        sessionStorage.removeItem("deadlineFood:swapFilters");
        return JSON.parse(raw) as {
          search: string;
          sortBy: SortOption;
          selectedSlots: MealSlot[];
          selectedTags: string[];
        };
      }
    } catch { /* sessionStorage unavailable */ }
    return null;
  });

  const [search, setSearch] = useState(savedFilters?.search ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(suggestedMealId ?? null);
  const [sortBy, setSortBy] = useState<SortOption>(savedFilters?.sortBy ?? "match");
  const [selectedSlots, setSelectedSlots] = useState<MealSlot[]>(suggestedMealId ? [] : (savedFilters?.selectedSlots ?? [rescueChoice.slot]));
  const [selectedTags, setSelectedTags] = useState<string[]>(savedFilters?.selectedTags ?? []);
  const [customTagInput, setCustomTagInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [undiscoveredPool, setUndiscoveredPool] = useState<Meal[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const excludeIds = [...customRecipes, ...(savedRecipes ?? [])].map((m) => m.id);
    fetchRecommenderRecommendations({
      sessionId,
      prefs,
      deadlines,
      excludeIds,
      count: 10,
      mealSlot: rescueChoice.slot,
      signal: controller.signal,
    })
      .then((recipes) => { if (!controller.signal.aborted) setUndiscoveredPool(recipes); })
      .catch(() => {});
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const originalDayIndex = plan.findIndex((entry) => entry.day === rescueChoice.day);
  const originalDay = originalDayIndex >= 0 ? plan[originalDayIndex] : undefined;
  const originalPlanMeal = originalDay?.meals.find((meal) => meal.slot === rescueChoice.slot);
  // Nullable resolve: a deleted original should read as "removed", not silently
  // fall back to the first catalogue recipe (#213 follow-up).
  const originalIsDeleted = !!originalPlanMeal && !!deletedRecipeIds?.has(originalPlanMeal.mealId);
  const originalMeal = originalPlanMeal && !originalIsDeleted ? mealById(originalPlanMeal.mealId, customRecipes) ?? null : null;
  const originalRemoved = !!originalPlanMeal && (!mealById(originalPlanMeal.mealId, customRecipes) || originalIsDeleted);
  const avoided = [...prefs.dislikes, ...prefs.allergens].map((value) => value.toLowerCase());
  const savedSet = useMemo(() => new Set((savedRecipes ?? []).map((m) => m.id)), [savedRecipes]);

  // Full candidate pool — allergen/dislike safe, not the current meal
  const savedNotInCustom = (savedRecipes ?? []).filter((m) => !customRecipes.some((c) => c.id === m.id));
  const candidatePool = [
    ...customRecipes,
    ...savedNotInCustom,
  ]
    .filter((meal) => meal.id !== originalPlanMeal?.mealId)
    .filter((meal) => !meal.ingredients.some((ingredient) => avoided.includes(ingredientName(ingredient).toLowerCase())))
    .filter((meal) => !meal.allergens.some((allergen) => avoided.includes(allergen.toLowerCase())))
    .filter((meal) => isMealDietaryCompatible(meal, prefs.dietary));

  // Tags available across the full pool (shown in filter panel)
  const availableTags = [...new Set(candidatePool.flatMap((m) => m.tags))].sort();

  // Apply slot filter (empty selectedSlots = show all)
  const slotFiltered = selectedSlots.length > 0
    ? candidatePool.filter((m) => m.mealSlots.some((s) => selectedSlots.includes(s as MealSlot)))
    : candidatePool;

  // Apply tag filter (all selected tags must match)
  const tagFiltered = selectedTags.length > 0
    ? slotFiltered.filter((m) => selectedTags.every((tag) => m.tags.includes(tag)))
    : slotFiltered;

  // Sort
  const allOptions = [...tagFiltered].sort((a, b) => {
    if (sortBy === "quickest") return a.time - b.time;
    if (sortBy === "cheapest") return a.price - b.price;
    if (sortBy === "fewest-ingredients") return a.ingredients.length - b.ingredients.length;
    if (sortBy === "easiest") return a.time - b.time || a.ingredients.length - b.ingredients.length;
    // "match" - Recommended for you: saved recipes first, then preference match, then time, then price
    const aSaved = savedSet.has(a.id) ? 1 : 0;
    const bSaved = savedSet.has(b.id) ? 1 : 0;
    if (aSaved !== bSaved) return bSaved - aSaved;
    const aScore = a.tags.filter((tag) => prefs.likes.some((like) => like.toLowerCase() === tag.toLowerCase())).length;
    const bScore = b.tags.filter((tag) => prefs.likes.some((like) => like.toLowerCase() === tag.toLowerCase())).length;
    return bScore - aScore || a.time - b.time || a.price - b.price;
  });

  // Apply search
  const filteredOptions = search.trim()
    ? allOptions.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : allOptions;

  const candidatePoolIds = new Set(candidatePool.map((m) => m.id));
  // undiscoveredPool is fetched slot-specifically on mount, so slot filter is
  // applied at the API level. Client-side we still apply safety filters + search.
  const undiscoveredCandidates = undiscoveredPool
    .filter((m) => isVerified(m))
    .filter((m) => !candidatePoolIds.has(m.id))
    .filter((m) => m.id !== originalPlanMeal?.mealId)
    .filter((m) => !m.ingredients.some((ingredient) => avoided.includes(ingredientName(ingredient).toLowerCase())))
    .filter((m) => !m.allergens.some((allergen) => avoided.includes(allergen.toLowerCase())))
    .filter((m) => isMealDietaryCompatible(m, prefs.dietary))
    .filter((m) => selectedSlots.length === 0 || m.mealSlots.some((s) => selectedSlots.includes(s as MealSlot)))
    .filter((m) => !search.trim() || m.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 3);

  // selectedId=null means "use first option as default"
  const effectiveId = selectedId ?? allOptions[0]?.id ?? undiscoveredCandidates[0]?.id ?? null;
  const selectedMeal =
    allOptions.find((m) => m.id === effectiveId) ??
    undiscoveredCandidates.find((m) => m.id === effectiveId) ??
    null;

  const weekStartIndex = originalDayIndex >= 0 ? Math.floor(originalDayIndex / 7) * 7 : 0;
  const affectedWeekEntries = plan.slice(weekStartIndex, weekStartIndex + 7);
  const total = affectedWeekEntries.reduce(
    (sum, entry) => sum + entry.meals.reduce((daySum, meal) => {
      if (deletedRecipeIds?.has(meal.mealId)) return daySum;
      return daySum + (mealById(meal.mealId, customRecipes)?.price ?? 0);
    }, 0),
    0,
  );
  const newTotal = selectedMeal ? total - (originalMeal?.price ?? 0) + selectedMeal.price : total;

  // Badge count mirrors the rendered "Showing:" chips exactly, so removing a
  // chip always lowers it (never raises) and the opening slot reads as 1 (#270).
  const activeFilterCount = selectedSlots.length + selectedTags.length;

  function closeAndReset() {
    onClose();
  }

  function toggleSlot(slot: MealSlot) {
    setSelectedId(null);
    setSelectedSlots((prev) => {
      const next = prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot];
      track("meal_swap_filter_changed", { filter_type: "slot", value: slot, active: next.includes(slot) });
      return next;
    });
  }

  function toggleTag(tag: string) {
    setSelectedId(null);
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      track("meal_swap_filter_changed", { filter_type: "tag", value: tag, active: next.includes(tag) });
      return next;
    });
  }

  function addCustomTag() {
    const tag = customTagInput.trim().toLowerCase();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags((prev) => [...prev, tag]);
      setSelectedId(null);
    }
    setCustomTagInput("");
  }

  function resetFilters() {
    setSelectedSlots([rescueChoice.slot]);
    setSelectedTags([]);
    setCustomTagInput("");
    setSelectedId(null);
  }

  function confirmSwapWith(meal: Meal) {
    const source = candidatePool.some((m) => m.id === meal.id) ? "saved" : "undiscovered";
    if (source === "undiscovered") registerPlanMeals([meal]);
    setPlan(
      plan.map((entry) =>
        entry.day === rescueChoice.day
          ? {
              ...entry,
              meals: originalPlanMeal ?
                entry.meals.map((m) => (m.slot === rescueChoice.slot ? { ...m, mealId: meal.id, rescued: true } : m)) :
                [...entry.meals, { slot: rescueChoice.slot, mealId: meal.id, rescued: true }],
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

  function viewRecipe(mealId: string) {
    track("meal_swap_recipe_viewed", { meal_id: mealId, day: rescueChoice.day, meal_slot: rescueChoice.slot });
    sessionStorage.setItem("deadlineFood:pendingRescueChoice", JSON.stringify(rescueChoice));
    sessionStorage.setItem("deadlineFood:swapFilters", JSON.stringify({
      search,
      sortBy,
      selectedSlots,
      selectedTags,
    }));
    closeAndReset();
    onSelectMeal(mealId);
  }

  const budgetAfter = prefs.budget - newTotal;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/40 p-0 sm:items-center sm:p-5" onClick={() => { track("meal_swap_cancelled", { action: "backdrop", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); }}>
      <Card className="flex h-[100dvh] w-full max-w-lg flex-col gap-0 !py-0 rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-lg" onClick={(e) => e.stopPropagation()}>

        {/* Drag handle — mobile affordance */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-stone-200 sm:hidden" />

        {/* Fixed header section — never scrolls */}
        <div className="shrink-0 px-5 pt-4">

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <Badge tone="amber">{slotLabels[rescueChoice.slot]}</Badge>
              <h2 className="mt-2 text-xl font-bold">{originalMeal ? "Change this meal" : "Choose a meal"}</h2>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => { track("meal_swap_cancelled", { action: "close", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); }}
              className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Current meal */}
          <div className="mt-4 rounded-lg bg-stone-50 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">Current</p>
            {originalMeal ? (
              <>
                <p className="flex items-center gap-2 break-words font-semibold text-stone-800">
                  <MealThumbnail meal={originalMeal} className="h-6 w-6" iconClassName="text-base" />
                  <span className="min-w-0">{originalMeal.name}</span>
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-stone-500">
                  <span className="flex items-center gap-1"><Clock3 size={12} /> {originalMeal.time} min</span>
                  <span>{money(originalMeal.price)}</span>
                </div>
              </>
            ) : (
              <p className="break-words font-semibold text-stone-800">{originalRemoved ? "Previous recipe was removed" : "No meal allocated"}</p>
            )}
          </div>

          {/* Search + Sort + Filter */}
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meals…"
                className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-8 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
            {/* Sort button */}
            <button
              type="button"
              onClick={() => { const next = !showSort; setShowSort(next); setShowFilters(false); track("meal_swap_sort_toggled", { open: next }); }}
              aria-label="Sort options"
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${sortBy !== "match" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : showSort ? "border-stone-300 bg-stone-100 text-stone-600" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}
            >
              <ArrowUpDown size={14} />
              <span>{sortLabels[sortBy]}</span>
            </button>
            {/* Filter button */}
            <button
              type="button"
              onClick={() => { const next = !showFilters; setShowFilters(next); setShowSort(false); track("meal_swap_filter_toggled", { open: next }); }}
              aria-label="Filter options"
              className={`relative flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${activeFilterCount > 0 ? "border-emerald-400 bg-emerald-50 text-emerald-700" : showFilters ? "border-stone-300 bg-stone-100 text-stone-600" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}
            >
              <SlidersHorizontal size={14} />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Active filter chips */}
          {(selectedSlots.length > 0 || selectedTags.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Showing:</span>
              {selectedSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => toggleSlot(slot)}
                  className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-200"
                >
                  {slotLabels[slot]} <X size={10} />
                </button>
              ))}
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-medium capitalize text-emerald-800 transition hover:bg-emerald-200"
                >
                  {tag} <X size={10} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort panel — fixed, never scrolls */}
        {showSort && (
          <div className="shrink-0 border-t border-stone-100 px-5 py-3">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">Sort by</p>
              <div className="flex flex-wrap gap-2">
                {(["match", "quickest", "cheapest", "fewest-ingredients", "easiest"] as SortOption[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { setSortBy(opt); setShowSort(false); track("meal_swap_sort_changed", { sort_by: opt }); }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${sortBy === opt ? "border-emerald-600 bg-emerald-100 text-emerald-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
                  >
                    {sortLabels[opt]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter panel — fixed, never scrolls */}
        {showFilters && (
          <div className="shrink-0 border-t border-stone-100 px-5 pb-2 pt-2">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-2">
              {/* Slot chips + tag chips in one compact scrollable area */}
              <div className="max-h-[4.5rem] overflow-y-auto">
                <div className="flex flex-wrap gap-1.5 pb-0.5">
                  {allSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleSlot(slot)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${selectedSlots.includes(slot) ? "border-emerald-600 bg-emerald-100 text-emerald-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
                    >
                      {slotLabels[slot]}
                    </button>
                  ))}
                  <span className="mx-0.5 self-center text-stone-300">|</span>
                  {[
                    ...selectedTags.filter((t) => !availableTags.includes(t)),
                    ...availableTags,
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition ${selectedTags.includes(tag) ? "border-emerald-600 bg-emerald-100 text-emerald-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              {/* Custom tag input + reset */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
                  placeholder="Add a tag…"
                  className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  disabled={!customTagInput.trim()}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40"
                >
                  Add
                </button>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="shrink-0 text-xs font-medium text-stone-400 hover:text-stone-600"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scrollable meal list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3">
          <div className="space-y-2">
            {filteredOptions.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-400">No saved meals match these filters</p>
            ) : (
              filteredOptions.map((meal, index) => {
                const isSelected = meal.id === effectiveId;
                const diff = originalMeal ? priceDiff(meal.price, originalMeal.price) : { label: `adds ${money(meal.price)}`, sign: "extra" as const };
                const DiffIcon = diff.sign === "saving" ? TrendingDown : diff.sign === "extra" ? TrendingUp : null;
                const diffColor = diff.sign === "saving" ? "text-emerald-700" : diff.sign === "extra" ? "text-rose-600" : "text-stone-400";
                const timeDiff = originalMeal ? originalMeal.time - meal.time : null;
                const isTopMatch = sortBy === "match" && index === 0;
                const rationale = isTopMatch
                  ? (savedSet.has(meal.id)
                      ? "Saved recipe · matches your preferences"
                      : prefs.likes.some((like) => meal.tags.some((tag) => tag.toLowerCase() === like.toLowerCase()))
                        ? "Matches your preferences"
                        : "Quick to prepare · within budget")
                  : null;

                return (
                  <div
                    key={meal.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(meal.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(meal.id); }}
                    className={`cursor-pointer overflow-hidden rounded-xl transition ${
                      isSelected
                        ? "border-2 border-emerald-500 bg-white"
                        : "border border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-stretch">
                      <div className="min-w-0 flex-1 p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="flex items-center gap-2 break-words font-semibold text-stone-800">
                            <MealThumbnail meal={meal} className="h-8 w-8" iconClassName="text-xl" />
                            <span className="min-w-0">{meal.name}</span>
                          </p>
                          {isVerified(meal) ? (
                            <Badge tone="blue"><BadgeCheck size={12} className="mr-1" /> Verified</Badge>
                          ) : (
                            <Badge tone="amber">Community</Badge>
                          )}
                          {savedSet.has(meal.id) && <Badge tone="blue">Saved</Badge>}
                          {isTopMatch && <Badge tone="green">Suggested</Badge>}
                        </div>
                        {rationale && (
                          <p className="mt-1 text-xs text-emerald-700 font-medium">{rationale}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                          <span className="flex items-center gap-1"><Clock3 size={11} /> {meal.time} min</span>
                          <span>{money(meal.price)}</span>
                          {DiffIcon && (
                            <span className={`flex items-center gap-0.5 font-medium ${diffColor}`}>
                              <DiffIcon size={11} /> {diff.label}
                            </span>
                          )}
                          {timeDiff !== null && (
                            <span className={`flex items-center gap-0.5 font-medium ${timeDiff > 0 ? "text-emerald-700" : timeDiff < 0 ? "text-rose-600" : "text-stone-400"}`}>
                              <Clock3 size={11} /> {timeDiff >= 0 ? `saves ${timeDiff} min` : `${Math.abs(timeDiff)} min longer`}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); viewRecipe(meal.id); }}
                        className="flex shrink-0 items-center justify-center border-l border-stone-200 px-4 text-stone-400 transition hover:bg-stone-100 hover:text-emerald-700"
                        aria-label={`View ${meal.name} recipe`}
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {undiscoveredCandidates.length > 0 && (
              <div className="pt-2">
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  <Sparkles size={13} className="text-violet-600" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">You might also like</p>
                </div>
                <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-2">
                  {undiscoveredCandidates.map((meal) => {
                    const isSelected = meal.id === effectiveId;
                    const diff = originalMeal ? priceDiff(meal.price, originalMeal.price) : { label: `adds ${money(meal.price)}`, sign: "extra" as const };
                    const DiffIcon = diff.sign === "saving" ? TrendingDown : diff.sign === "extra" ? TrendingUp : null;
                    const diffColor = diff.sign === "saving" ? "text-emerald-700" : diff.sign === "extra" ? "text-rose-600" : "text-stone-400";
                    const timeDiff = originalMeal ? originalMeal.time - meal.time : null;
                    return (
                      <div
                        key={meal.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(meal.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(meal.id); }}
                        className={`cursor-pointer overflow-hidden rounded-xl transition ${
                          isSelected
                            ? "border-2 border-violet-400 bg-violet-100"
                            : "border border-violet-200 bg-white hover:border-violet-300 hover:bg-violet-50"
                        }`}
                      >
                        <div className="flex items-stretch">
                          <div className="min-w-0 flex-1 p-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="flex items-center gap-2 break-words font-semibold text-stone-800">
                                <MealThumbnail meal={meal} className="h-8 w-8" iconClassName="text-xl" />
                                <span className="min-w-0">{meal.name}</span>
                              </p>
                              {isVerified(meal) ? (
                                <Badge tone="blue"><BadgeCheck size={12} className="mr-1" /> Verified</Badge>
                              ) : (
                                <Badge tone="amber">Community</Badge>
                              )}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                              <span className="flex items-center gap-1"><Clock3 size={11} /> {meal.time} min</span>
                              <span>{money(meal.price)}</span>
                              {DiffIcon && (
                                <span className={`flex items-center gap-0.5 font-medium ${diffColor}`}>
                                  <DiffIcon size={11} /> {diff.label}
                                </span>
                              )}
                              {timeDiff !== null && (
                                <span className={`flex items-center gap-0.5 font-medium ${timeDiff > 0 ? "text-emerald-700" : timeDiff < 0 ? "text-rose-600" : "text-stone-400"}`}>
                                  <Clock3 size={11} /> {timeDiff >= 0 ? `saves ${timeDiff} min` : `${Math.abs(timeDiff)} min longer`}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); viewRecipe(meal.id); }}
                            className="flex shrink-0 items-center justify-center border-l border-violet-200 px-4 text-stone-400 transition hover:bg-violet-100 hover:text-violet-700"
                            aria-label={`View ${meal.name} recipe`}
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {onGoToDiscover && (
              <button
                type="button"
                onClick={() => { track("meal_swap_discover_clicked", { day: rescueChoice.day, meal_slot: rescueChoice.slot }); onGoToDiscover(); }}
                className="mt-1 w-full py-2.5 text-center text-sm font-medium text-violet-600 hover:text-violet-800"
              >
                Find more in Discover →
              </button>
            )}
          </div>
        </div>

        {/* Fixed bottom — summary + actions always visible */}
        <div className="shrink-0 border-t border-stone-100 px-5 pb-6 pt-3 sm:pb-4">

          {/* Before / after summary */}
          {selectedMeal && (() => {
            const timeDiff = originalMeal ? originalMeal.time - selectedMeal.time : null;
            const pDiff = originalMeal ? priceDiff(selectedMeal.price, originalMeal.price) : { label: `adds ${money(selectedMeal.price)}`, sign: "extra" as const };
            return (
              <div className="mb-3 rounded-xl bg-stone-900 px-4 py-3 text-white">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                      <ShoppingCart size={10} /> Week now
                    </p>
                    <p className="mt-1 text-base font-bold">{money(total)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">After</p>
                    <p className={`mt-1 text-base font-bold ${newTotal < total ? "text-emerald-300" : newTotal > total ? "text-rose-300" : "text-white"}`}>
                      {money(newTotal)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                      <PiggyBank size={10} /> Left
                    </p>
                    <p className={`mt-1 text-base font-bold ${budgetAfter >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {budgetAfter >= 0 ? money(budgetAfter) : `${money(Math.abs(budgetAfter))} over`}
                    </p>
                  </div>
                </div>
                {/* Time & price pills */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-emerald-700/50 pt-3">
                  {timeDiff !== null && (
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${timeDiff > 0 ? "bg-emerald-700 text-emerald-100" : timeDiff < 0 ? "bg-rose-800/70 text-rose-200" : "bg-emerald-800 text-emerald-300"}`}>
                      <Clock3 size={11} />
                      {timeDiff >= 0 ? `saves ${timeDiff} min` : `${Math.abs(timeDiff)} min longer`}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${pDiff.sign === "saving" ? "bg-emerald-700 text-emerald-100" : pDiff.sign === "extra" ? "bg-rose-800/70 text-rose-200" : "bg-emerald-800 text-emerald-300"}`}>
                    {pDiff.sign === "saving" ? <TrendingDown size={11} /> : pDiff.sign === "extra" ? <TrendingUp size={11} /> : null}
                    {pDiff.label}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <AppButton
              variant="secondary"
              onClick={() => { track("meal_swap_cancelled", { action: "keep_original", day: rescueChoice.day, meal_slot: rescueChoice.slot }); closeAndReset(); }}
            >
              Keep original
            </AppButton>
            <AppButton onClick={() => { if (selectedMeal) confirmSwapWith(selectedMeal); }} disabled={!selectedMeal}>
              Use selected
            </AppButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
