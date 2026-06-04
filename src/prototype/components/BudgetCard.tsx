import { cn } from "@/lib/utils";
import type { Meal, PlanEntry } from "../types";
import { getMealById, money } from "../utils";

export function BudgetCard({
  plan,
  customRecipes,
  budget,
}: {
  plan: PlanEntry[];
  customRecipes: Meal[];
  budget: number;
}) {
  const total = plan.reduce(
    (sum, entry) => sum + entry.meals.reduce((daySum, meal) => daySum + getMealById(meal.mealId, customRecipes).price, 0),
    0,
  );
  const weekCount = Math.max(1, Math.ceil(plan.length / 7));
  const horizonBudget = budget * weekCount;
  const remaining = horizonBudget - total;
  const percent = Math.min(100, Math.round((total / Math.max(horizonBudget, 1)) * 100));
  const budgetLabel = weekCount === 1 ? `your £${budget.toFixed(0)} weekly budget` : `${weekCount} weeks at £${budget.toFixed(0)}/week`;

  return (
    <div className="rounded-lg bg-emerald-800 p-5 text-white">
      <div>
        <p className="text-sm text-emerald-100">Planned spend</p>
        <p className="mt-1 text-3xl font-bold">{money(total)}</p>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-emerald-950/40">
        <div className={cn("h-full rounded-full", remaining >= 0 ? "bg-emerald-200" : "bg-rose-300")} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-emerald-100">
        {remaining >= 0 ? `${money(remaining)} remaining from ${budgetLabel}` : `${money(Math.abs(remaining))} over ${budgetLabel} - see cheaper swaps`}
      </p>
    </div>
  );
}
