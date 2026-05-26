import { Link } from "react-router";

import { BudgetSummary } from "@/components/deadline-food/BudgetSummary";
import { DailyPlanCard } from "@/components/deadline-food/DailyPlanCard";
import { EventLog } from "@/components/deadline-food/EventLog";
import { MealTag } from "@/components/deadline-food/MealTag";
import { Button } from "@/components/ui/button";
import { strategyName } from "@/components/deadline-food/format";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

export function PlanDashboardPage() {
  const { state, commands } = useDeadlineMode();

  if (state.activePlan === null) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold text-slate-950">No active deadline-week plan yet.</h1>
        <p className="mt-3 text-slate-600">Compare strategies and choose one to generate the first prototype plan.</p>
        <Button asChild className="mt-6">
          <Link to="/deadline-mode/strategies">Compare strategies</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <MealTag tone="good">Deadline Mode active</MealTag>
          <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">
            {strategyName(state.activePlan.strategy)} plan for this week
          </h1>
          <p className="max-w-3xl text-slate-600">
            Rescue actions are available on meals that assume cooking, prep or reheating time.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" onClick={commands.editConstraints}>
            <Link to="/deadline-mode/setup">Edit constraints</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/fallbacks">Browse fallbacks</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <BudgetSummary plan={state.activePlan} />
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="grid gap-4 md:grid-cols-2">
            {state.activePlan.days.map(day => (
              <DailyPlanCard key={day.dayId} plannedMeal={day} />
            ))}
          </section>
          <EventLog events={state.events} />
        </div>
      </div>
    </main>
  );
}
