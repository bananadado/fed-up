import { Link } from "react-router";

import { FallbackMealCard } from "@/components/deadline-food/FallbackMealCard";
import { MealTag } from "@/components/deadline-food/MealTag";
import { Button } from "@/components/ui/button";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

export function FallbackBrowsePage() {
  const { state } = useDeadlineMode();
  const fallbacks = state.meals.filter(meal => meal.mealType === "fallback");

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <MealTag tone="good">App meal options - availability and prices are illustrative.</MealTag>
          <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">Campus fallback catalogue</h1>
          <p className="max-w-3xl text-slate-600">
            Seeded options represent the kind of affordable, low-effort choices the internal API will eventually serve.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/deadline-mode/plan">Back to plan</Link>
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {fallbacks.map(meal => (
          <FallbackMealCard key={meal.id} meal={meal} />
        ))}
      </div>
    </main>
  );
}
