import { Import } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { allergens, dietary, dislikes, likes, universities } from "../data";
import type { Preferences, Screen } from "../types";
import { AppButton, ChoiceGroup, Field, SelectField } from "../components/primitives";
import { formatCookingLimit } from "../utils";

export function SettingsScreen({
  prefs,
  setPrefs,
  setScreen,
}: {
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  setScreen: (screen: Screen) => void;
}) {
  function toggle(values: string[], value: string, update: (next: string[]) => void) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function addSelection(values: string[], value: string, update: (next: string[]) => void) {
    const normalizedValue = value.trim();

    if (!normalizedValue || values.some((item) => item.toLowerCase() === normalizedValue.toLowerCase())) {
      return;
    }

    update([...values, normalizedValue]);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Preferences</h1>
      <p className="mt-2 text-stone-600">Your saved limits shape every plan and replacement.</p>
      <Card className="mt-7 gap-0 rounded-lg border-stone-200 bg-white p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Maximum cooking time</span>
            <input
              type="range"
              min="0"
              max="180"
              step="15"
              value={prefs.maxTime ?? 180}
              disabled={prefs.maxTime === null}
              onChange={(event) => setPrefs({ ...prefs, maxTime: +event.target.value })}
              className="mt-4 w-full accent-emerald-700 disabled:opacity-40"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-sm text-stone-500">{formatCookingLimit(prefs.maxTime)}</p>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <input type="checkbox" checked={prefs.maxTime === null} onChange={(event) => setPrefs({ ...prefs, maxTime: event.target.checked ? null : 180 })} />
                Unlimited
              </label>
            </div>
          </label>
          <label>
            <span className="text-sm font-semibold">Weekly budget</span>
            <div className="mt-2 flex rounded-lg border border-stone-200 px-3">
              <span className="py-3 text-stone-400">£</span>
              <Input type="number" value={prefs.budget} onChange={(event) => setPrefs({ ...prefs, budget: +event.target.value })} className="h-auto border-0 p-3 shadow-none focus-visible:ring-0" />
            </div>
          </label>
          <Field label="Location (postcode)" value={prefs.postcode} onChange={(postcode) => setPrefs({ ...prefs, postcode })} placeholder="e.g. SW7 2AZ" />
          <SelectField
            label="Your university"
            value={prefs.university}
            onChange={(university) => setPrefs({ ...prefs, university })}
            options={universities.map((university) => ({ value: university, label: university }))}
          />
        </div>
        <div className="mt-6 space-y-5">
          <ChoiceGroup
            title="Dietary requirements"
            options={dietary}
            selected={prefs.dietary}
            onToggle={(value) => toggle(prefs.dietary, value, (next) => setPrefs({ ...prefs, dietary: next }))}
            onAdd={(value) => addSelection(prefs.dietary, value, (next) => setPrefs({ ...prefs, dietary: next }))}
            addPlaceholder="Add a dietary requirement"
          />
          <ChoiceGroup
            title="Allergic to / cannot eat"
            options={allergens}
            selected={prefs.allergens}
            onToggle={(value) => toggle(prefs.allergens, value, (next) => setPrefs({ ...prefs, allergens: next }))}
            onAdd={(value) => addSelection(prefs.allergens, value, (next) => setPrefs({ ...prefs, allergens: next }))}
            addPlaceholder="Add an allergy or avoided ingredient"
            danger
          />
          <ChoiceGroup
            title="Foods and meals I like"
            options={likes}
            selected={prefs.likes}
            onToggle={(value) => toggle(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
            onAdd={(value) => addSelection(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
            addPlaceholder="Add anything else you like"
          />
          <ChoiceGroup
            title="Ingredients I dislike"
            options={dislikes}
            selected={prefs.dislikes}
            onToggle={(value) => toggle(prefs.dislikes, value, (next) => setPrefs({ ...prefs, dislikes: next }))}
            onAdd={(value) => addSelection(prefs.dislikes, value, (next) => setPrefs({ ...prefs, dislikes: next }))}
            addPlaceholder="Add an ingredient you dislike"
          />
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
