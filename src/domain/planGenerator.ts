import {
  canCook,
  canPrepareBase,
  createPlannedMealId,
  formatDayLabel,
  formatMealSlotLabel,
  formatPlanItemLabel,
  getContextTags,
  getMealSlotsForConstraints,
  getPlanningDayIds,
  matchesDietaryTags,
  sortByPreferredFallback,
} from "./constraints";
import type { MealOption, MealSlot, PlannedMeal, PlanningConstraints, PlanStrategy, WeeklyPlan } from "./types";

function cheapest(meals: MealOption[]): MealOption | undefined {
  return [...meals].sort((a, b) => a.pricePence - b.pricePence || a.prepMinutes - b.prepMinutes)[0];
}

type PlanItem = {
  calendarDayId: string;
  mealSlot: MealSlot;
};

function getPlanItems(constraints: PlanningConstraints): PlanItem[] {
  const slots = getMealSlotsForConstraints(constraints);

  return getPlanningDayIds().flatMap(calendarDayId => slots.map(mealSlot => ({ calendarDayId, mealSlot })));
}

function compatibleMeals(
  meals: MealOption[],
  constraints: PlanningConstraints,
  mealType?: MealOption["mealType"],
  mealSlot?: MealSlot,
) {
  return meals.filter(meal => {
    if (mealType !== undefined && meal.mealType !== mealType) return false;
    if (mealSlot !== undefined && !meal.mealSlots.includes(mealSlot)) return false;
    if (!matchesDietaryTags(meal, constraints.dietaryTags)) return false;
    if (meal.mealType !== "fallback" && meal.prepMinutes > constraints.maxPrepMinutes) return false;
    if (meal.mealType !== "fallback" && constraints.kitchenAccess === "none") return false;
    return true;
  });
}

function pickFallback(
  meals: MealOption[],
  constraints: PlanningConstraints,
  projectedTotalWithoutCandidate: number,
  usedIds: Set<string>,
  mealSlot: MealSlot,
): MealOption {
  const fallbacks = sortByPreferredFallback(
    compatibleMeals(meals, constraints, "fallback", mealSlot).filter(meal => !usedIds.has(meal.id)),
    constraints,
    projectedTotalWithoutCandidate,
  );

  return fallbacks[0] ?? cheapest(compatibleMeals(meals, constraints, "fallback", mealSlot)) ?? meals[0]!;
}

function pickRemix(
  meals: MealOption[],
  constraints: PlanningConstraints,
  base: MealOption | undefined,
  index: number,
  mealSlot: MealSlot,
) {
  const remixes = compatibleMeals(meals, constraints, "remix", mealSlot).filter(
    meal => base === undefined || meal.derivesFromPrepBaseId === base.id,
  );

  return remixes[index % Math.max(remixes.length, 1)] ?? cheapest(compatibleMeals(meals, constraints, "quick_cook", mealSlot));
}

function pickQuickCook(meals: MealOption[], constraints: PlanningConstraints, mealSlot: MealSlot) {
  return cheapest(compatibleMeals(meals, constraints, "quick_cook", mealSlot));
}

function buildPlanMeal(item: PlanItem, meal: MealOption, constraints: PlanningConstraints): PlannedMeal {
  return {
    dayId: createPlannedMealId(item.calendarDayId, item.mealSlot, constraints),
    calendarDayId: item.calendarDayId,
    mealSlot: item.mealSlot,
    dateLabel:
      getMealSlotsForConstraints(constraints).length === 1
        ? formatDayLabel(item.calendarDayId)
        : formatPlanItemLabel(item.calendarDayId, item.mealSlot),
    contextTags: [formatMealSlotLabel(item.mealSlot).toLowerCase(), ...getContextTags(item.calendarDayId, constraints)],
    meal,
    wasRescued: false,
  };
}

function buildPrepOncePlan(constraints: PlanningConstraints, meals: MealOption[]): PlannedMeal[] {
  const items = getPlanItems(constraints);
  const base = cheapest(compatibleMeals(meals, constraints, "prep_base").filter(meal => canPrepareBase(constraints, meal)));
  const usedFallbacks = new Set<string>();
  let baseUsed = false;

  return items.map((item, index) => {
    const meal =
      !baseUsed && base !== undefined && (item.mealSlot === "dinner" || index === 0)
        ? base
        : pickRemix(meals, constraints, base, index - 1, item.mealSlot) ??
          pickQuickCook(meals, constraints, item.mealSlot) ??
          pickFallback(meals, constraints, 0, usedFallbacks, item.mealSlot);

    if (meal.id === base?.id) baseUsed = true;
    if (meal.mealType === "fallback") usedFallbacks.add(meal.id);
    return buildPlanMeal(item, meal, constraints);
  });
}

function buildMixedPlan(constraints: PlanningConstraints, meals: MealOption[]): PlannedMeal[] {
  const items = getPlanItems(constraints);
  const base = cheapest(compatibleMeals(meals, constraints, "prep_base").filter(meal => canPrepareBase(constraints, meal)));
  const usedFallbacks = new Set<string>();
  let runningTotal = 0;
  let remixIndex = 0;
  let baseUsed = false;

  return items.map((item, index) => {
    let meal: MealOption | undefined;

    if (!baseUsed && base !== undefined && canCook(constraints) && (item.mealSlot === "dinner" || index === 0)) {
      meal = base;
      baseUsed = true;
    } else if (constraints.lateCampusDays.includes(item.calendarDayId) && item.mealSlot === "dinner") {
      meal = pickFallback(meals, constraints, runningTotal, usedFallbacks, item.mealSlot);
    } else {
      meal = pickRemix(meals, constraints, base, remixIndex, item.mealSlot) ?? pickQuickCook(meals, constraints, item.mealSlot);
      remixIndex += 1;
    }

    meal ??= pickFallback(meals, constraints, runningTotal, usedFallbacks, item.mealSlot);

    if (meal.mealType === "fallback") usedFallbacks.add(meal.id);
    runningTotal += meal.pricePence;

    return buildPlanMeal(item, meal, constraints);
  });
}

function buildNoCookPlan(constraints: PlanningConstraints, meals: MealOption[]): PlannedMeal[] {
  const items = getPlanItems(constraints);
  const usedFallbacks = new Set<string>();
  let runningTotal = 0;

  return items.map(item => {
    const meal = pickFallback(meals, constraints, runningTotal, usedFallbacks, item.mealSlot);

    usedFallbacks.add(meal.id);
    runningTotal += meal.pricePence;

    return buildPlanMeal(item, meal, constraints);
  });
}

function explainStrategy(strategy: PlanStrategy, days: PlannedMeal[], constraints: PlanningConstraints): string {
  const fallbackCount = days.filter(day => day.meal.mealType === "fallback").length;

  if (strategy === "no-cook-rescue") {
    return "This plan avoids cooking and uses compatible campus options for the full week.";
  }

  if (strategy === "prep-once") {
    return "This plan spends one short prep block up front so later meals stay cheap and low effort.";
  }

  if (constraints.lateCampusDays.length > 0) {
    return `This plan mixes prepared meals with ${fallbackCount} planned campus fallback${fallbackCount === 1 ? "" : "s"} for late study days.`;
  }

  return "This plan keeps some cooking flexibility while preserving a fallback route if the week gets tighter.";
}

export function generatePlan(
  constraints: PlanningConstraints,
  strategy: PlanStrategy,
  meals: MealOption[],
): WeeklyPlan {
  if (meals.length === 0) {
    return {
      id: `${strategy}-${constraints.budgetPence}-${constraints.deadlineDays.join("-")}-empty`,
      strategy,
      constraints,
      days: [],
      totalCostPence: 0,
      budgetPence: constraints.budgetPence,
      totalPrepMinutes: 0,
      explanation: "No meals are available for planning.",
    };
  }

  const days =
    strategy === "prep-once"
      ? buildPrepOncePlan(constraints, meals)
      : strategy === "mixed"
        ? buildMixedPlan(constraints, meals)
        : buildNoCookPlan(constraints, meals);
  const totalCostPence = days.reduce((sum, day) => sum + day.meal.pricePence, 0);
  const totalPrepMinutes = days.reduce((sum, day) => sum + day.meal.prepMinutes, 0);

  return {
    id: `${strategy}-${constraints.budgetPence}-${constraints.deadlineDays.join("-")}`,
    strategy,
    constraints,
    days,
    totalCostPence,
    budgetPence: constraints.budgetPence,
    totalPrepMinutes,
    explanation: explainStrategy(strategy, days, constraints),
  };
}
