import { matchesDietaryTags, sortByPreferredFallback } from "./constraints";
import type { MealOption, RescueProposal, WeeklyPlan } from "./types";

export function findRescueOptions(plan: WeeklyPlan, dayId: string, meals: MealOption[]): RescueProposal[] {
  const plannedMeal = plan.days.find(day => day.dayId === dayId);

  if (plannedMeal === undefined || plannedMeal.meal.mealType === "fallback") {
    return [];
  }

  const totalWithoutOriginal = plan.totalCostPence - plannedMeal.meal.pricePence;
  const compatibleFallbacks = meals.filter(
    meal =>
      meal.mealType === "fallback" &&
      meal.mealSlots.includes(plannedMeal.mealSlot) &&
      matchesDietaryTags(meal, plan.constraints.dietaryTags),
  );

  return sortByPreferredFallback(compatibleFallbacks, plan.constraints, totalWithoutOriginal).map(replacement => {
    const newTotalCostPence = totalWithoutOriginal + replacement.pricePence;

    return {
      dayId,
      originalMeal: plannedMeal.meal,
      replacement,
      oldTotalCostPence: plan.totalCostPence,
      newTotalCostPence,
      timeSavedMinutes: Math.max(plannedMeal.meal.prepMinutes - replacement.prepMinutes, 0),
      newBudgetDifferencePence: plan.budgetPence - newTotalCostPence,
    };
  });
}

export function applyRescueSwap(plan: WeeklyPlan, proposal: RescueProposal): WeeklyPlan {
  const days = plan.days.map(day => {
    if (day.dayId !== proposal.dayId) return day;

    return {
      ...day,
      meal: proposal.replacement,
      originalMeal: proposal.originalMeal,
      wasRescued: true,
    };
  });
  const totalCostPence = days.reduce((sum, day) => sum + day.meal.pricePence, 0);
  const totalPrepMinutes = days.reduce((sum, day) => sum + day.meal.prepMinutes, 0);

  return {
    ...plan,
    days,
    totalCostPence,
    totalPrepMinutes,
    explanation:
      proposal.newBudgetDifferencePence >= 0
        ? `The ${proposal.replacement.name} fallback keeps the plan within budget.`
        : `The lowest compatible fallback is over budget by ${Math.abs(proposal.newBudgetDifferencePence)} pence.`,
  };
}
