import { ArrowLeft, Clock, MapPin, Wallet } from "lucide-react";
import { Link, useParams } from "react-router";

import { formatPence, mealTypeLabel } from "@/components/deadline-food/format";
import { MealTag } from "@/components/deadline-food/MealTag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

export function RecipePage() {
  const { mealId } = useParams();
  const { state } = useDeadlineMode();
  const meal = state.meals.find(candidate => candidate.id === mealId);

  if (meal === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-bold text-slate-950">Recipe not found.</h1>
        <Button asChild className="mt-6">
          <Link to="/deadline-mode/plan">Back to plan</Link>
        </Button>
      </main>
    );
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
        <MealTag tone={meal.mealType === "fallback" ? "good" : "neutral"}>{mealTypeLabel(meal)}</MealTag>
        <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">{meal.name}</h1>
        <p className="max-w-3xl text-slate-600">{meal.recipe.summary}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="grid gap-6">
          <Card className="rounded-lg border-slate-200 bg-white">
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-950">Ingredients</h2>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-slate-700">
                {meal.recipe.ingredients.map(ingredient => (
                  <li key={ingredient} className="rounded-md bg-slate-50 px-3 py-2">
                    {ingredient}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white">
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-950">Method</h2>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 text-slate-700">
                {meal.recipe.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-md bg-slate-50 px-3 py-3">
                    <span className="font-semibold text-slate-950">{index + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>

        <aside className="grid h-fit gap-4">
          <Card className="rounded-lg border-slate-200 bg-white">
            <CardContent className="grid gap-3 pt-0 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <Wallet className="size-4" />
                {formatPence(meal.pricePence)}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4" />
                {meal.prepMinutes} min
              </div>
              {meal.provider && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4" />
                  {meal.provider} near {meal.location}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="text-base">Why it fits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-slate-700">
              <p>{meal.recipe.whyItFits}</p>
              {meal.recipe.prepNotes && <p>{meal.recipe.prepNotes}</p>}
              {meal.recipe.storage && <p>{meal.recipe.storage}</p>}
              <div className="flex flex-wrap gap-2">
                {meal.mealSlots.map(slot => (
                  <MealTag key={slot}>{slot}</MealTag>
                ))}
                {meal.dietaryTags.map(tag => (
                  <MealTag key={tag} tone="good">
                    {tag}
                  </MealTag>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
