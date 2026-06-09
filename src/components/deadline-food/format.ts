import type { MealOption, PlanStrategy, DeadlineEvent } from "@/domain/types";

export function formatPence(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}£${(Math.abs(value) / 100).toFixed(2)}`;
}

export function strategyName(strategy: PlanStrategy): string {
  return {
    "prep-once": "Prep Once",
    mixed: "Mixed Mode",
    "no-cook-rescue": "No-Cook Rescue",
  }[strategy];
}

export function mealTypeLabel(meal: MealOption): string {
  return {
    prep_base: "prepared",
    remix: "prepared remix",
    quick_cook: "quick cook",
    fallback: "campus fallback",
  }[meal.mealType];
}

export function eventLabel(event: DeadlineEvent): string {
  if (event.type === "strategy_selected") return `strategy_selected: ${strategyName(event.strategy)}`;
  if (event.type === "plan_generated") return `plan_generated: ${strategyName(event.plan.strategy)}`;
  if (event.type === "rescue_started") return `rescue_started: ${event.dayId}`;
  if (event.type === "rescue_confirmed") return `rescue_confirmed: ${event.dayId}`;
  return event.type;
}
