import { Link, useNavigate } from "react-router";
import { usePostHog } from "@posthog/react";

import { StrategyCard } from "@/components/deadline-food/StrategyCard";
import { Button } from "@/components/ui/button";
import type { PlanStrategy } from "@/domain/types";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

export function StrategySelectionPage() {
  const { state, commands } = useDeadlineMode();
  const navigate = useNavigate();
  const posthog = usePostHog();

  function selectStrategy(strategy: PlanStrategy) {
    posthog?.capture("strategy_selected", { strategy });
    commands.selectStrategy(strategy);
    navigate("/deadline-mode/plan");
  }

  if (state.constraints === null) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold text-slate-950">Set up Deadline Mode first.</h1>
        <Button asChild className="mt-6">
          <Link to="/deadline-mode/setup">Go to setup</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Strategy comparison</p>
          <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">Choose the week strategy that matches the pressure.</h1>
          <p className="max-w-3xl text-slate-600">
            Each option is valid. The recommendation simply reflects your budget, kitchen access and late campus days.
          </p>
        </div>
        <Button asChild variant="outline" onClick={commands.editConstraints}>
          <Link to="/deadline-mode/setup">Edit constraints</Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {state.rankedStrategies.map(strategy => (
          <StrategyCard key={strategy.strategy} strategy={strategy} onSelect={() => selectStrategy(strategy.strategy)} />
        ))}
      </div>
    </main>
  );
}
