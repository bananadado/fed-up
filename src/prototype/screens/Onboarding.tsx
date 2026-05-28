import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Import, Leaf, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allergens, dietary, dislikes, likes, sourceOptions, universities } from "../data";
import type { Deadline, Preferences, Screen } from "../types";
import { AppButton, Badge, ChoiceGroup, Field, SelectField } from "../components/primitives";
import { formatCookingLimit } from "../utils";
import type { TrackPrototypeEvent } from "../analytics";

function Progress({ step }: { step: number }) {
  const labels = ["Calendar", "Preferences", "Recipe sources"];

  return (
    <div className="mb-8 flex gap-2">
      {labels.map((label, index) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              index < step ? "bg-emerald-700 text-white" : index === step ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-400",
            )}
          >
            {index < step ? <Check size={15} /> : index + 1}
          </div>
          <span className={cn("hidden text-sm sm:block", index === step ? "font-semibold text-stone-900" : "text-stone-500")}>{label}</span>
          {index < labels.length - 1 && <div className="h-px flex-1 bg-stone-200" />}
        </div>
      ))}
    </div>
  );
}

export function Onboarding({
  setOnboarded,
  setScreen,
  prefs,
  setPrefs,
  deadlines,
  setDeadlines,
  selectedSources,
  setSelectedSources,
  track,
}: {
  setOnboarded: (onboarded: boolean) => void;
  setScreen: (screen: Screen) => void;
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  deadlines: Deadline[];
  setDeadlines: (deadlines: Deadline[]) => void;
  selectedSources: string[];
  setSelectedSources: (sources: string[]) => void;
  track: TrackPrototypeEvent;
}) {
  const [step, setStep] = useState(0);
  const [calendarChoice, setCalendarChoice] = useState("google");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMessage, setImportMessage] = useState("");

  function parseICS(text: string) {
    const blocks = text.split("BEGIN:VEVENT").slice(1);
    const parsed = blocks.map((block, index) => {
      const title = (block.match(/SUMMARY:(.+)/)?.[1] || `Imported event ${index + 1}`).trim();
      const raw = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{4}))?/) || [];
      const date = raw[1] ? new Date(`${raw[1].slice(0, 4)}-${raw[1].slice(4, 6)}-${raw[1].slice(6, 8)}T12:00:00`) : null;
      const label = date ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Upcoming";
      const time = raw[2] ? `${raw[2].slice(0, 2)}:${raw[2].slice(2, 4)}` : "All day";

      return { id: `ics-${index}`, title, date: label, time, intensity: "Imported" };
    });

    return parsed.length ? parsed.slice(0, 5) : null;
  }

  function loadICS(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseICS(String(reader.result));

      if (parsed) {
        setDeadlines(parsed);
        setImportMessage(`${parsed.length} calendar events imported.`);
        track("ics_calendar_imported", { event_count: parsed.length });
      } else {
        setImportMessage("No events found. Showing the example deadline week instead.");
        track("ics_calendar_imported", { event_count: 0 });
      }
    };
    reader.readAsText(file);
  }

  function toggle(values: string[], value: string, update: (next: string[]) => void) {
    const selected = !values.includes(value);
    track("onboarding_choice_toggled", { step, value, selected });
    update(selected ? [...values, value] : values.filter((item) => item !== value));
  }

  function addSelection(values: string[], value: string, update: (next: string[]) => void) {
    const normalizedValue = value.trim();

    if (!normalizedValue || values.some((item) => item.toLowerCase() === normalizedValue.toLowerCase())) {
      return;
    }

    track("onboarding_custom_choice_added", { step, value: normalizedValue });
    update([...values, normalizedValue]);
  }

  function finish() {
    track("onboarding_completed", {
      recipe_sources: selectedSources,
      dietary_requirements: prefs.dietary,
      kitchen_access: prefs.kitchen,
      budget_pounds: prefs.budget,
    });
    setOnboarded(true);
    setScreen("dashboard");
  }

  return (
    <div className="min-h-screen bg-[#faf9f5] px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex items-center gap-2 font-bold text-emerald-800">
          <Leaf size={20} />
          Deadline Food Autopilot
        </div>
        <Progress step={step} />
        {step === 0 && (
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 1 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">Bring in your deadlines</h2>
            <p className="mt-2 text-stone-600">We only need workload signals to plan around your difficult days.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  track("calendar_source_selected", { source: "google" });
                  setCalendarChoice("google");
                }}
                className={cn("rounded-lg border p-5 text-left transition", calendarChoice === "google" ? "border-emerald-600 bg-emerald-50" : "border-stone-200 hover:border-stone-300")}
              >
                <CalendarDays className="mb-3 text-emerald-700" />
                <p className="font-semibold">Link Google Calendar</p>
                <p className="mt-1 text-sm text-stone-500">Prototype connection using sample deadlines</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  track("calendar_source_selected", { source: "ics" });
                  fileRef.current?.click();
                }}
                className={cn("rounded-lg border p-5 text-left transition", calendarChoice === "ics" ? "border-emerald-600 bg-emerald-50" : "border-stone-200 hover:border-stone-300")}
              >
                <Import className="mb-3 text-emerald-700" />
                <p className="font-semibold">Import .ics file</p>
                <p className="mt-1 text-sm text-stone-500">Upload calendar export</p>
                <Input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(event) => { setCalendarChoice("ics"); loadICS(event); }} />
              </button>
            </div>
            {importMessage && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{importMessage}</p>}
            <div className="mt-7 rounded-lg bg-stone-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Detected high-pressure events</p>
                <Badge tone="amber">{deadlines.length} found</Badge>
              </div>
              <div className="space-y-2">
                {deadlines.map((deadline) => (
                  <div key={deadline.id} className="flex items-center justify-between rounded-lg bg-white p-3 text-sm">
                    <div>
                      <p className="font-medium">{deadline.title}</p>
                      <p className="text-stone-500">{deadline.date}</p>
                    </div>
                    <span className="text-stone-500">{deadline.time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-7 flex justify-end">
              <AppButton onClick={() => { track("onboarding_step_completed", { step: 0, next_step: 1, calendar_choice: calendarChoice }); setStep(1); }}>
                Continue <ArrowRight size={16} />
              </AppButton>
            </div>
          </Card>
        )}
        {step === 1 && (
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 2 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">What works for you?</h2>
            <p className="mt-2 text-stone-600">Set hard limits once. Recommendations stay inside them.</p>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold">Maximum cooking time</span>
                <div className="mt-2 rounded-lg border border-stone-200 p-3">
                  <input
                    type="range"
                    min="0"
                    max="180"
                    step="15"
                    value={prefs.maxTime ?? 180}
                    disabled={prefs.maxTime === null}
                    onChange={(event) => setPrefs({ ...prefs, maxTime: +event.target.value })}
                    onMouseUp={() => track("onboarding_preference_changed", { field: "max_time", value: prefs.maxTime })}
                    onKeyUp={() => track("onboarding_preference_changed", { field: "max_time", value: prefs.maxTime })}
                    className="w-full accent-emerald-700 disabled:opacity-40"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-stone-600">
                      Up to <strong>{formatCookingLimit(prefs.maxTime)}</strong>
                    </p>
                    <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                      <input type="checkbox" checked={prefs.maxTime === null} onChange={(event) => { track("onboarding_preference_changed", { field: "max_time_unlimited", value: event.target.checked }); setPrefs({ ...prefs, maxTime: event.target.checked ? null : 180 }); }} />
                      Unlimited
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    Choose 0 to 3 hours, or remove the limit.
                  </p>
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Weekly food budget</span>
                <div className="mt-2 flex items-center rounded-lg border border-stone-200 px-3">
                  <span className="text-stone-500">£</span>
                  <Input value={prefs.budget} onChange={(event) => setPrefs({ ...prefs, budget: +event.target.value || 0 })} onBlur={() => track("onboarding_preference_changed", { field: "budget", value: prefs.budget })} type="number" min="1" className="h-auto border-0 p-3 shadow-none focus-visible:ring-0" />
                </div>
              </label>
              <SelectField
                label="Kitchen access"
                value={prefs.kitchen}
                onChange={(kitchen) => { track("onboarding_preference_changed", { field: "kitchen", value: kitchen }); setPrefs({ ...prefs, kitchen }); }}
                options={[
                  { value: "full", label: "Full kitchen" },
                  { value: "limited", label: "Microwave / kettle only" },
                  { value: "none", label: "No kitchen access" },
                ]}
              />
              <SelectField
                label="Your university"
                value={prefs.university}
                onChange={(university) => { track("onboarding_preference_changed", { field: "university", value: university }); setPrefs({ ...prefs, university }); }}
                options={universities.map((university) => ({ value: university, label: university }))}
              />
              <Field label="Location (postcode)" value={prefs.postcode} onChange={(postcode) => setPrefs({ ...prefs, postcode })} onBlur={() => track("onboarding_preference_changed", { field: "postcode" })} placeholder="e.g. SW7 2AZ" />
            </div>
            <div className="mt-7 space-y-5">
              <ChoiceGroup
                title="Dietary requirements (leave blank if none)"
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
                title="Optional inspiration foods"
                options={likes}
                selected={prefs.likes}
                onToggle={(value) => toggle(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
                onAdd={(value) => addSelection(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
                addPlaceholder="Add a meal you often choose"
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
            <div className="mt-8 flex justify-between">
              <AppButton variant="ghost" onClick={() => { track("onboarding_step_back_clicked", { step: 1, next_step: 0 }); setStep(0); }}>
                <ArrowLeft size={16} /> Back
              </AppButton>
              <AppButton onClick={() => { track("onboarding_step_completed", { step: 1, next_step: 2 }); setStep(2); }}>
                Continue <ArrowRight size={16} />
              </AppButton>
            </div>
          </Card>
        )}
        {step === 2 && (
          <Card className="gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 3 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">Choose recommendation priorities</h2>
            <p className="mt-2 text-stone-600">Pick what Autopilot should optimise for. You can change this later.</p>
            <div className="mt-7 space-y-3">
              {sourceOptions.map((source) => {
                const active = selectedSources.includes(source.id);

                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => {
                      track("recipe_source_toggled", { source: source.id, selected: !active });
                      setSelectedSources(active ? selectedSources.filter((value) => value !== source.id) : [...selectedSources, source.id]);
                    }}
                    className={cn("flex w-full items-center justify-between rounded-lg border p-4 text-left", active ? "border-emerald-600 bg-emerald-50" : "border-stone-200")}
                  >
                    <div>
                      <p className="font-semibold">{source.name}</p>
                      <p className="text-sm text-stone-500">{source.desc}</p>
                    </div>
                    <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border", active ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300")}>{active && <Check size={14} />}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Campus/provider options and prices in this prototype are illustrative rather than live availability.</div>
            <div className="mt-8 flex justify-between">
              <AppButton variant="ghost" onClick={() => { track("onboarding_step_back_clicked", { step: 2, next_step: 1 }); setStep(1); }}>
                <ArrowLeft size={16} /> Back
              </AppButton>
              <AppButton onClick={finish}>
                Create my plan <Sparkles size={16} />
              </AppButton>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
