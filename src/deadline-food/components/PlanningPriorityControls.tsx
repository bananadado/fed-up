import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PlanningPriorities, Preferences } from "../types";
import type { TrackEvent } from "../analytics";

type PriorityControl<Key extends keyof PlanningPriorities = keyof PlanningPriorities> = {
  key: Key;
  title: string;
  description: string;
  options: {
    value: PlanningPriorities[Key];
    label: string;
  }[];
};

const controls: PriorityControl[] = [
  {
    key: "batchCooking",
    title: "Batch cooking",
    description: "Use lighter evenings to cook once for later deadline meals.",
    options: [
      { value: "off", label: "Off" },
      { value: "balanced", label: "Balanced" },
      { value: "high", label: "More batch prep" },
    ],
  },
  {
    key: "breakfastRoutine",
    title: "Breakfast routine",
    description: "Breakfast can be repeated when that reduces decisions.",
    options: [
      { value: "varied", label: "Different breakfasts" },
      { value: "rotate", label: "Rotate 2 options" },
      { value: "repeat", label: "Repeat weekday breakfast" },
    ],
  },
  {
    key: "mealRepeats",
    title: "Meal repeats",
    description: "Control how much Fed Up repeats lunches and dinners.",
    options: [
      { value: "varied", label: "Keep varied" },
      { value: "balanced", label: "Repeat when useful" },
      { value: "low-effort", label: "Lowest effort" },
    ],
  },
  {
    key: "ingredientReuse",
    title: "Ingredient reuse",
    description: "Prefer meals that share ingredients within the week.",
    options: [
      { value: "low", label: "Low" },
      { value: "balanced", label: "Balanced" },
      { value: "high", label: "Reduce waste" },
    ],
  },
  {
    key: "campusFallbacks",
    title: "Campus fallbacks",
    description: "Use ready options when cooking is not realistic.",
    options: [
      { value: "off", label: "Off" },
      { value: "when-busy", label: "Busy days only" },
      { value: "allowed", label: "Allowed" },
    ],
  },
];

export function PlanningPriorityControls({
  prefs,
  setPrefs,
  track,
  source,
}: {
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  track: TrackEvent;
  source: "onboarding" | "settings";
}) {
  function updatePriority<Key extends keyof PlanningPriorities>(key: Key, value: PlanningPriorities[Key]) {
    track(`${source}_preference_changed`, { field: `planning_priorities.${key}`, value });
    setPrefs({
      ...prefs,
      planningPriorities: {
        ...prefs.planningPriorities,
        [key]: value,
      },
    });
  }

  return (
    <div className="space-y-4">
      {controls.map((control) => (
        <div key={control.key}>
          <div>
            <p className="font-semibold">{control.title}</p>
            <p className="mt-1 text-sm text-stone-500">{control.description}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {control.options.map((option) => {
              const active = prefs.planningPriorities[control.key] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updatePriority(control.key, option.value)}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition",
                    active ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300",
                  )}
                >
                  <span>{option.label}</span>
                  {active && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
