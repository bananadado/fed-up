import { Wallet } from "lucide-react";

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
  const remaining = budget - total;
  const percent = Math.min(100, Math.round((total / Math.max(budget, 1)) * 100));
  const batchGroups = plan
    .flatMap((entry) => entry.meals)
    .filter((meal) => meal.batchGroup)
    .reduce<Record<string, number>>((groups, meal) => {
      groups[meal.batchGroup ?? "batch"] = (groups[meal.batchGroup ?? "batch"] ?? 0) + 1;
      return groups;
    }, {});
  const repeatedPortions = Object.values(batchGroups).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);

  return (
    <div className="rounded-lg bg-emerald-800 p-5 text-white">
      <div className="flex justify-between">
        <div>
          <p className="text-sm text-emerald-100">Planned spend</p>
          <p className="mt-1 text-3xl font-bold">{money(total)}</p>
        </div>
        <Wallet className="text-emerald-200" />
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-emerald-950/40">
        <div className={cn("h-full rounded-full", remaining >= 0 ? "bg-emerald-200" : "bg-rose-300")} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-emerald-100">
        {remaining >= 0 ? `${money(remaining)} remaining from your £${budget.toFixed(0)} budget` : `${money(Math.abs(remaining))} over budget - see cheaper swaps`}
      </p>
      {repeatedPortions > 0 && (
        <p className="mt-2 text-sm text-emerald-100">
          Includes {repeatedPortions} planned portions from batch-prepped or repeated meals.
        </p>
      )}
    </div>
  );
}
