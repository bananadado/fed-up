import { ArrowRight, Leaf } from "lucide-react";

import { AppButton } from "../components/primitives";
import type { TrackPrototypeEvent } from "../analytics";

export function Landing({ onStart, track }: { onStart: () => void; track: TrackPrototypeEvent }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#faf9f5]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Leaf size={20} />
          Deadline Food Autopilot
        </div>
        <h1 className="max-w-xl text-5xl font-bold leading-[1.04] sm:text-6xl">Healthy meals that fit around coursework.</h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
          Choose your budget, cooking time and food preferences, then get a realistic plan that keeps easy meals ready when academic work gets busy.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <AppButton onClick={() => { track("deadline_mode_started", { entry_point: "setup_cta" }); onStart(); }} className="px-6 py-3">
            Build my meal plan <ArrowRight size={17} />
          </AppButton>
        </div>
      </div>
    </div>
  );
}
