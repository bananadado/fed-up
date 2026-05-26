import { Import } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Preferences, Screen } from "../types";
import { AppButton } from "../components/primitives";

export function SettingsScreen({
  prefs,
  setPrefs,
  setScreen,
}: {
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  setScreen: (screen: Screen) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Preferences</h1>
      <p className="mt-2 text-stone-600">Your saved limits shape every plan and replacement.</p>
      <Card className="mt-7 gap-0 rounded-lg border-stone-200 bg-white p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Maximum cooking time</span>
            <input type="range" min="0" max="45" step="5" value={prefs.maxTime} onChange={(event) => setPrefs({ ...prefs, maxTime: +event.target.value })} className="mt-4 w-full accent-emerald-700" />
            <p className="text-sm text-stone-500">{prefs.maxTime} minutes</p>
          </label>
          <label>
            <span className="text-sm font-semibold">Weekly budget</span>
            <div className="mt-2 flex rounded-lg border border-stone-200 px-3">
              <span className="py-3 text-stone-400">£</span>
              <Input type="number" value={prefs.budget} onChange={(event) => setPrefs({ ...prefs, budget: +event.target.value })} className="h-auto border-0 p-3 shadow-none focus-visible:ring-0" />
            </div>
          </label>
        </div>
        <div className="mt-6 rounded-lg bg-stone-50 p-4">
          <p className="font-semibold">Calendar connection</p>
          <p className="mt-1 text-sm text-stone-500">Google Calendar - Sample connection enabled</p>
          <AppButton variant="secondary" className="mt-4">
            <Import size={15} /> Re-import .ics
          </AppButton>
        </div>
        <div className="mt-6 flex justify-end">
          <AppButton onClick={() => setScreen("dashboard")}>Save preferences</AppButton>
        </div>
      </Card>
    </div>
  );
}
