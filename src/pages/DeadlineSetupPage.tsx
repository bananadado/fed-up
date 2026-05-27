import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { usePostHog } from "@posthog/react";

import { MealTag } from "@/components/deadline-food/MealTag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDayLabel, mealSlots as availableMealSlots, planningWeekDays } from "@/domain/constraints";
import type { KitchenAccess, MealSlot, PlanningConstraints } from "@/domain/types";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

export function DeadlineSetupPage() {
  const { state, commands } = useDeadlineMode();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const initialConstraints = state.constraints ?? state.canonicalConstraints;
  const [budgetPounds, setBudgetPounds] = useState(() =>
    initialConstraints === null ? "24" : (initialConstraints.budgetPence / 100).toFixed(0),
  );
  const [maxPrepMinutes, setMaxPrepMinutes] = useState(() => initialConstraints?.maxPrepMinutes ?? 20);
  const [deadlineDays, setDeadlineDays] = useState<string[]>(() =>
    initialConstraints?.deadlineDays ?? ["monday", "wednesday", "thursday"],
  );
  const [lateCampusDays, setLateCampusDays] = useState<string[]>(() =>
    initialConstraints?.lateCampusDays ?? ["wednesday", "thursday"],
  );
  const [kitchenAccess, setKitchenAccess] = useState<KitchenAccess>(() => initialConstraints?.kitchenAccess ?? "full");
  const [dietaryTag, setDietaryTag] = useState(() => initialConstraints?.dietaryTags[0] ?? "none");
  const [selectedMealSlots, setSelectedMealSlots] = useState<MealSlot[]>(() => initialConstraints?.mealSlots ?? ["dinner"]);
  const [preferredLocation, setPreferredLocation] = useState(() => initialConstraints?.preferredLocation ?? "library");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const constraints: PlanningConstraints = {
      budgetPence: Math.round(Number(budgetPounds) * 100),
      deadlineDays,
      lateCampusDays,
      maxPrepMinutes,
      kitchenAccess,
      dietaryTags: dietaryTag === "none" ? [] : [dietaryTag],
      mealSlots: selectedMealSlots,
      preferredLocation,
    };

    if (commands.submitConstraints(constraints)) {
      posthog?.capture("constraints_submitted", {
        budget_pounds: Number(budgetPounds),
        max_prep_minutes: maxPrepMinutes,
        kitchen_access: kitchenAccess,
        dietary_tag: dietaryTag,
        deadline_days_count: deadlineDays.length,
        late_campus_days_count: lateCampusDays.length,
        meal_slots: selectedMealSlots,
        preferred_location: preferredLocation,
      });
      commands.viewStrategies();
      navigate("/deadline-mode/strategies");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8">
      <div className="mb-8 space-y-3">
        <MealTag tone="good">Deadline Mode setup</MealTag>
        <h1 className="text-3xl font-bold text-slate-950 md:text-4xl">Tell the app what this week actually allows.</h1>
        <p className="max-w-3xl text-slate-600">
          Keep it lightweight: budget, deadline pressure, cooking time and late campus days are enough for the first
          plan.
        </p>
      </div>

      <Card className="rounded-lg border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Deadline-week constraints</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-8" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budget">Food budget for planned meals</Label>
                <Input
                  id="budget"
                  min="1"
                  step="0.5"
                  type="number"
                  value={budgetPounds}
                  onChange={event => setBudgetPounds(event.target.value)}
                />
                <p className="text-sm text-slate-500">Pounds sterling, e.g. 24.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prep-time">Maximum cooking or prep time</Label>
                <Input
                  id="prep-time"
                  min="0"
                  type="number"
                  value={maxPrepMinutes}
                  onChange={event => setMaxPrepMinutes(Number(event.target.value))}
                />
                <p className="text-sm text-slate-500">Minutes for the most effortful meal.</p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-950">Deadline-heavy days</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {planningWeekDays.map(day => (
                    <label key={day} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <input
                        checked={deadlineDays.includes(day)}
                        type="checkbox"
                        onChange={() => setDeadlineDays(current => toggleValue(current, day))}
                      />
                      {formatDayLabel(day)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-950">Late campus or library days</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {planningWeekDays.map(day => (
                    <label key={day} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <input
                        checked={lateCampusDays.includes(day)}
                        type="checkbox"
                        onChange={() => setLateCampusDays(current => toggleValue(current, day))}
                      />
                      {formatDayLabel(day)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Kitchen access</Label>
                <Select value={kitchenAccess} onValueChange={value => setKitchenAccess(value as KitchenAccess)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full kitchen</SelectItem>
                    <SelectItem value="limited">Limited kitchen</SelectItem>
                    <SelectItem value="none">No kitchen access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dietary preference</Label>
                <Select value={dietaryTag} onValueChange={setDietaryTag}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No restriction</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="vegan">Vegan</SelectItem>
                    <SelectItem value="halal">Halal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferred fallback area</Label>
                <Select value={preferredLocation} onValueChange={setPreferredLocation}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="library">Library</SelectItem>
                    <SelectItem value="campus">Campus</SelectItem>
                    <SelectItem value="halls">Halls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-950">Meals to plan</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableMealSlots.map(slot => (
                  <label key={slot} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <input
                      checked={selectedMealSlots.includes(slot)}
                      type="checkbox"
                      onChange={() => setSelectedMealSlots(current => toggleValue(current, slot) as MealSlot[])}
                    />
                    {slot === "lunch" ? "Lunches" : "Dinners"}
                  </label>
                ))}
              </div>
              <p className="text-sm text-slate-500">Add lunches when you want the plan to cover campus daytime meals too.</p>
            </fieldset>

            {state.validationErrors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {state.validationErrors.join(" ")}
              </div>
            )}

            <Button className="w-full sm:w-fit" type="submit" size="lg">
              Compare strategies
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
