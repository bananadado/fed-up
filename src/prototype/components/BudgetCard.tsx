import { cn } from "@/lib/utils";
import type { Meal, PlanEntry } from "../types";
import { getMealById, money } from "../utils";

function entryTotal(entry: PlanEntry, customRecipes: Meal[]): number {
  return entry.meals.reduce((daySum, meal) => daySum + getMealById(meal.mealId, customRecipes).price, 0);
}

export function BudgetCard({
  plan,
  customRecipes,
  budget,
}: {
  plan: PlanEntry[];
  customRecipes: Meal[];
  budget: number;
}) {
  const weekCount = Math.max(1, Math.ceil(plan.length / 7));
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const entries = plan.slice(index * 7, index * 7 + 7);
    const total = entries.reduce((sum, entry) => sum + entryTotal(entry, customRecipes), 0);
    const remaining = budget - total;
    const percent = Math.min(100, Math.round((total / Math.max(budget, 1)) * 100));
    const start = entries[0]?.day;
    const end = entries[entries.length - 1]?.day;
    const dateLabel = start && end ? `${start} - ${end}` : "No planned days";

    return { dateLabel, total, remaining, percent };
  });
  const firstWeek = weeks[0];

  return (
    <div className="rounded-lg bg-emerald-800 p-5 text-white">
      <div>
        <p className="text-sm text-emerald-100">Planned spend</p>
        <p className="mt-1 text-3xl font-bold">{money(budget)}</p>
        <p className="mt-1 text-sm text-emerald-100">Weekly budget limit</p>
        {firstWeek && (
          <p className="mt-1 text-sm text-emerald-100">
            Week 1 planned: {money(firstWeek.total)}
          </p>
        )}
      </div>
      <div className="mt-5 space-y-4">
        {weeks.map((week, index) => (
          <div key={index}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Week {index + 1}</p>
                <p className="text-xs text-emerald-100">{week.dateLabel}</p>
              </div>
              <p className={cn("shrink-0 text-sm font-semibold", week.remaining >= 0 ? "text-emerald-100" : "text-rose-200")}>
                {money(week.total)}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-950/40">
              <div className={cn("h-full rounded-full", week.remaining >= 0 ? "bg-emerald-200" : "bg-rose-300")} style={{ width: `${week.percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-emerald-100">
              {week.remaining >= 0 ? `${money(week.remaining)} left` : `${money(Math.abs(week.remaining))} over`} from {money(budget)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
