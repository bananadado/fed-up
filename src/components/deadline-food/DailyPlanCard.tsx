import { BookOpen, Clock, MapPin, RefreshCw } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlannedMeal } from "@/domain/types";
import { formatPence, mealTypeLabel } from "./format";
import { MealTag } from "./MealTag";

export function DailyPlanCard({ plannedMeal }: { plannedMeal: PlannedMeal }) {
  const canRescue = plannedMeal.meal.mealType !== "fallback";

  return (
    <Card className="rounded-lg border-slate-200 bg-white">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{plannedMeal.dateLabel}</CardTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              {plannedMeal.contextTags.map(tag => (
                <MealTag key={tag} tone={tag.includes("late") ? "warn" : "neutral"}>
                  {tag}
                </MealTag>
              ))}
              {plannedMeal.wasRescued && <MealTag tone="good">rescued</MealTag>}
            </div>
          </div>
          <MealTag tone={plannedMeal.meal.mealType === "fallback" ? "good" : "neutral"}>{mealTypeLabel(plannedMeal.meal)}</MealTag>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Link
            to={`/recipes/${plannedMeal.meal.id}`}
            className="inline-flex items-center gap-2 font-semibold text-slate-950 underline-offset-4 hover:underline"
            aria-label={`View recipe for ${plannedMeal.meal.name}`}
          >
            {plannedMeal.meal.name}
            <BookOpen className="size-4" />
          </Link>
          {plannedMeal.meal.provider && (
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="size-4" />
              {plannedMeal.meal.provider} near {plannedMeal.meal.location}
            </p>
          )}
          {plannedMeal.originalMeal && (
            <p className="mt-1 text-sm text-slate-600">Switched from {plannedMeal.originalMeal.name}.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-950">{formatPence(plannedMeal.meal.pricePence)}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-4" />
            {plannedMeal.meal.prepMinutes} min
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {plannedMeal.meal.suitabilityTags.map(tag => (
            <MealTag key={tag}>{tag}</MealTag>
          ))}
        </div>
        {canRescue && (
          <Button asChild variant="outline" className="w-full justify-center">
            <Link to={`/deadline-mode/rescue/${plannedMeal.dayId}`}>
              <RefreshCw className="size-4" />
              I have even less time today
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
