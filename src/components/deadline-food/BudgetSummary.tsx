import { AlertTriangle, Clock, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { WeeklyPlan } from "@/domain/types";
import { cn } from "@/lib/utils";
import { formatPence } from "./format";

export function BudgetSummary({ plan }: { plan: WeeklyPlan }) {
  const difference = plan.budgetPence - plan.totalCostPence;
  const percentage = Math.min(Math.round((plan.totalCostPence / plan.budgetPence) * 100), 140);
  const overBudget = difference < 0;

  return (
    <Card className="rounded-lg border-slate-200 bg-white">
      <CardContent className="grid gap-5 pt-0 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Wallet className="size-4" />
              {formatPence(plan.totalCostPence)} projected
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium",
                overBudget ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800",
              )}
            >
              {overBudget && <AlertTriangle className="size-4" />}
              {overBudget ? `${formatPence(Math.abs(difference))} over budget` : `${formatPence(difference)} left`}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="size-4" />
              {plan.totalPrepMinutes} min total effort
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-full rounded-full", overBudget ? "bg-amber-500" : "bg-emerald-500")}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">{plan.explanation}</p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
          Budget: <span className="font-semibold text-slate-950">{formatPence(plan.budgetPence)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
