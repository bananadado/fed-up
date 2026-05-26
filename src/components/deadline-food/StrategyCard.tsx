import { ArrowRight, CheckCircle2, Clock, PackageCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankedStrategy } from "@/domain/types";
import { cn } from "@/lib/utils";
import { formatPence } from "./format";

export function StrategyCard({
  strategy,
  onSelect,
}: {
  strategy: RankedStrategy;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        "rounded-lg border-slate-200 bg-white",
        strategy.recommended && "border-emerald-300 shadow-md shadow-emerald-100",
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl">{strategy.label}</CardTitle>
          {strategy.recommended && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="size-3.5" />
              Recommended
            </span>
          )}
        </div>
        <p className="text-sm leading-6 text-slate-600">{strategy.reason}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
            <span className="flex items-center gap-2">
              <Wallet className="size-4" />
              Projected cost
            </span>
            <span className="font-semibold text-slate-950">{formatPence(strategy.projectedCostPence)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
            <span className="flex items-center gap-2">
              <Clock className="size-4" />
              Total effort
            </span>
            <span className="font-semibold text-slate-950">{strategy.totalPrepMinutes} min</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
            <span className="flex items-center gap-2">
              <PackageCheck className="size-4" />
              Planned fallbacks
            </span>
            <span className="font-semibold text-slate-950">{strategy.fallbackMealCount}</span>
          </div>
        </div>
        <Button className="w-full" onClick={onSelect}>
          Use {strategy.label}
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
