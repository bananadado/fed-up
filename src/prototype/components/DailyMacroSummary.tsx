import { Activity } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Meal, PlanEntry } from "../types";
import { getMealById } from "../utils";

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

export function DailyMacroSummary({
  plan,
  customRecipes,
}: {
  plan: PlanEntry[];
  customRecipes: Meal[];
}) {
  const days = plan.slice(0, 7);

  return (
    <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
        <Activity size={16} className="text-emerald-600" />
        Daily nutrition
      </div>
      {days.length === 0 ? (
        <p className="mt-3 text-sm text-stone-400">Generate a plan to see daily nutrition.</p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {days.map((entry) => {
              const t = dailyTotals(entry, customRecipes);
              return (
                <div key={entry.day} className="rounded-md bg-stone-50 px-3 py-2">
                  <p className="text-xs font-semibold text-stone-600">{entry.day}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500">
                    <span><span className="font-semibold text-stone-700">{t.calories}</span> kcal</span>
                    <span><span className="font-semibold text-stone-700">{t.protein}g</span> protein</span>
                    <span><span className="font-medium text-stone-500">{t.carbs}g</span> carbs</span>
                    <span><span className="font-medium text-stone-500">{t.fat}g</span> fat</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-stone-400">Broad nutrition signal — illustrative values based on recipe estimates.</p>
        </>
      )}
    </Card>
  );
}
