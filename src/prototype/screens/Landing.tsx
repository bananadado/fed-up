import { ArrowRight, Leaf, Utensils } from "lucide-react";

import { Card } from "@/components/ui/card";
import { defaultDeadlines } from "../data";
import { AppButton, Badge } from "../components/primitives";
import type { TrackPrototypeEvent } from "../analytics";

export function Landing({ onStart, track }: { onStart: () => void; track: TrackPrototypeEvent }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#faf9f5]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-10 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Leaf size={20} />
            Deadline Food Autopilot BOB
          </div>
          <Badge tone="green">Meal planning for busy study weeks</Badge>
          <h1 className="mt-5 max-w-xl text-5xl font-bold leading-[1.04] sm:text-6xl">Healthy meals that fit around coursework.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
            Choose your budget, cooking time and food preferences, then get a realistic plan that keeps easy meals ready when academic work gets busy.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <AppButton onClick={() => { track("deadline_mode_started", { entry_point: "setup_cta" }); onStart(); }} className="px-6 py-3">
              Build my meal plan <ArrowRight size={17} />
            </AppButton>
          </div>
          <p className="mt-7 text-sm text-stone-500">No judgement. No calorie targets. Just food choices that fit the week you actually have.</p>
        </div>
        <Card className="relative gap-0 rounded-lg border-stone-200 bg-white p-5 shadow-xl shadow-stone-200/60">
          <div className="flex items-center justify-between pb-4">
            <p className="font-semibold">Meal plan preview</p>
            <Badge tone="green">
              <Utensils size={12} className="mr-1" /> Food first
            </Badge>
          </div>
          <div className="mb-4 rounded-lg bg-emerald-700 p-4 text-white">
            <p className="text-sm text-emerald-100">Suggested next cook</p>
            <p className="mt-1 font-semibold">Roast veg & chickpea traybake</p>
            <div className="mt-3 flex gap-3 text-sm">
              <span>20 mins</span>
              <span>£2.85 / portion</span>
            </div>
          </div>
          <div className="space-y-3">
            {defaultDeadlines.map((deadline, index) => (
              <div key={deadline.id} className={index === 0 ? "rounded-lg border border-amber-100 bg-amber-50 p-4" : "rounded-lg border border-stone-100 bg-stone-50 p-4"}>
                <div className="flex justify-between gap-4">
                  <p className="font-medium">{deadline.title}</p>
                  <span className="text-xs text-stone-500">{deadline.time}</span>
                </div>
                <p className="mt-1 text-sm text-stone-500">{deadline.date} - used to lower cooking effort</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
