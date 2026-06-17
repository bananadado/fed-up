import { generatePlan } from "./planGenerator";
import type { MealOption, PlanningConstraints, PlanStrategy, RankedStrategy } from "./types";

const strategyLabels: Record<PlanStrategy, string> = {
  "prep-once": "Prep Once",
  mixed: "Mixed Mode",
  "no-cook-rescue": "No-Cook Rescue",
};

function reasonFor(strategy: PlanStrategy, constraints: PlanningConstraints): string {
  if (strategy === "no-cook-rescue") {
    return constraints.kitchenAccess === "none" || constraints.maxPrepMinutes < 10
      ? "Cooking is not realistic, so this keeps every meal collection-only."
      : "This is the lowest-effort option when the week gets compressed.";
  }

  if (strategy === "prep-once") {
    return constraints.budgetPence <= 2100
      ? "Your budget is tight, so one prep block keeps the week cheaper."
      : "One prep session reduces daily decisions and keeps later meals fast.";
  }

  return constraints.lateCampusDays.length > 0
    ? "Late campus days are expected, so this mixes prepared meals with planned fallbacks."
    : "This keeps some prep benefits without assuming every meal will be cooked.";
}

function preferenceScore(strategy: PlanStrategy, constraints: PlanningConstraints): number {
  if (constraints.kitchenAccess === "none" || constraints.maxPrepMinutes < 10) {
    return strategy === "no-cook-rescue" ? 100 : 0;
  }

  if (constraints.budgetPence <= 2100 && constraints.maxPrepMinutes >= 20) {
    return strategy === "prep-once" ? 95 : strategy === "mixed" ? 60 : 30;
  }

  if (constraints.lateCampusDays.length > 0) {
    return strategy === "mixed" ? 95 : strategy === "prep-once" ? 65 : 55;
  }

  if (constraints.maxPrepMinutes >= 20) {
    return strategy === "prep-once" ? 85 : strategy === "mixed" ? 70 : 45;
  }

  return strategy === "no-cook-rescue" ? 80 : strategy === "mixed" ? 55 : 25;
}

export function rankStrategies(constraints: PlanningConstraints, meals: MealOption[]): RankedStrategy[] {
  if (meals.length === 0) return [];

  const strategies: PlanStrategy[] = ["prep-once", "mixed", "no-cook-rescue"];
  const ranked = strategies
    .map(strategy => {
      const plan = generatePlan(constraints, strategy, meals);
      const budgetBonus = plan.totalCostPence <= constraints.budgetPence ? 12 : -12;
      const fallbackMealCount = plan.days.filter(day => day.meal.mealType === "fallback").length;

      return {
        strategy,
        label: strategyLabels[strategy],
        projectedCostPence: plan.totalCostPence,
        totalPrepMinutes: plan.totalPrepMinutes,
        fallbackMealCount,
        reason: reasonFor(strategy, constraints),
        score: preferenceScore(strategy, constraints) + budgetBonus,
      };
    })
    .sort((a, b) => b.score - a.score || a.projectedCostPence - b.projectedCostPence);

  return ranked.map((strategy, index) => ({
    strategy: strategy.strategy,
    label: strategy.label,
    projectedCostPence: strategy.projectedCostPence,
    totalPrepMinutes: strategy.totalPrepMinutes,
    fallbackMealCount: strategy.fallbackMealCount,
    reason: strategy.reason,
    recommended: index === 0,
  }));
}
