import { ArrowLeft, CheckCircle2, Clock, Wallet } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { usePostHog } from "@posthog/react";

import { FallbackMealCard } from "@/components/deadline-food/FallbackMealCard";
import { formatPence } from "@/components/deadline-food/format";
import { MealTag } from "@/components/deadline-food/MealTag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RescueProposal } from "@/domain/types";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

function BudgetResult({ proposal }: { proposal: RescueProposal }) {
  const inBudget = proposal.newBudgetDifferencePence >= 0;

  return (
    <div className={inBudget ? "rounded-lg bg-emerald-50 p-4 text-emerald-900" : "rounded-lg bg-amber-50 p-4 text-amber-950"}>
      {inBudget
        ? `This keeps the plan ${formatPence(proposal.newBudgetDifferencePence)} within budget.`
        : `This is ${formatPence(Math.abs(proposal.newBudgetDifferencePence))} over budget. It is still the lowest-effort compatible app option.`}
    </div>
  );
}

export function RescuePage() {
  const { dayId } = useParams();
  const { state, commands } = useDeadlineMode();
  const navigate = useNavigate();
  const posthog = usePostHog();

  useEffect(() => {
    if (dayId !== undefined && state.activePlan !== null && state.currentRescueDayId !== dayId) {
      commands.startRescue(dayId);
    }
  }, [commands, dayId, state.activePlan, state.currentRescueDayId]);

  if (state.activePlan === null || dayId === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold text-slate-950">No active plan to rescue.</h1>
        <Button asChild className="mt-6">
          <Link to="/deadline-mode/plan">Back to plan</Link>
        </Button>
      </main>
    );
  }

  const plannedMeal = state.activePlan.days.find(day => day.dayId === dayId);
  const proposals = state.currentRescueDayId === dayId ? state.rescueCandidates : [];
  const bestProposal = proposals[0];

  function confirm(proposal: RescueProposal) {
    posthog?.capture("rescue_confirmed", {
      day_id: dayId,
      original_meal_id: proposal.originalMeal.id,
      replacement_meal_id: proposal.replacement.id,
      time_saved_minutes: proposal.timeSavedMinutes,
      within_budget: proposal.newBudgetDifferencePence >= 0,
    });
    commands.confirmRescue(proposal);
    navigate("/deadline-mode/plan");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8">
      <Button asChild variant="ghost" className="mb-6 px-0">
        <Link to="/deadline-mode/plan">
          <ArrowLeft className="size-4" />
          Back to plan
        </Link>
      </Button>

      <div className="mb-8 space-y-3">
        <MealTag tone="warn">Rescue substitution</MealTag>
        <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">I have even less time today</h1>
        <p className="max-w-3xl text-slate-600">
          Switch this meal to the lowest-effort compatible fallback and see the budget impact before confirming.
        </p>
      </div>

      {plannedMeal === undefined || plannedMeal.meal.mealType === "fallback" ? (
        <Card className="rounded-lg border-slate-200 bg-white">
          <CardContent className="pt-0">
            <p className="text-slate-700">This day is already using a fallback option.</p>
          </CardContent>
        </Card>
      ) : bestProposal === undefined ? (
        <Card className="rounded-lg border-slate-200 bg-white">
          <CardContent className="pt-0">
            <p className="text-slate-700">No compatible app fallback is available for the current dietary constraints.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="rounded-lg border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Original plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-950">{bestProposal.originalMeal.name}</h2>
              <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                <span className="flex items-center gap-2">
                  <Wallet className="size-4" />
                  {formatPence(bestProposal.originalMeal.pricePence)}
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="size-4" />
                  {bestProposal.originalMeal.prepMinutes} min
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-emerald-300 bg-white shadow-md shadow-emerald-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-700" />
                Proposed fallback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FallbackMealCard meal={bestProposal.replacement} />
              <div className="grid gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
                <div>New total: {formatPence(bestProposal.newTotalCostPence)}</div>
                <div>Spend change: {formatPence(bestProposal.newTotalCostPence - bestProposal.oldTotalCostPence)}</div>
                <div>Time saved: {bestProposal.timeSavedMinutes} min</div>
              </div>
              <BudgetResult proposal={bestProposal} />
              <Button className="w-full" onClick={() => confirm(bestProposal)}>
                Confirm fallback swap
              </Button>
            </CardContent>
          </Card>

          {proposals.length > 1 && (
            <section className="space-y-3 lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-950">Other compatible fallback options</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {proposals.slice(1, 3).map(proposal => (
                  <Card key={proposal.replacement.id} className="rounded-lg border-slate-200 bg-white">
                    <CardContent className="space-y-4 pt-0">
                      <FallbackMealCard meal={proposal.replacement} />
                      <Button variant="outline" className="w-full" onClick={() => confirm(proposal)}>
                        Use this fallback
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
