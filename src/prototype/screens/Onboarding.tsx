import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Import, Leaf, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allergens, calendarProviders, cookingAbilities, dietary, dislikes, likes, sourceOptions, universities } from "../data";
import type { CalendarEvent, CalendarProvider, Deadline, Preferences, Screen } from "../types";
import { AppButton, Badge, ChoiceGroup, Field, SelectField } from "../components/primitives";
import { formatCookingLimit } from "../utils";
import { IngredientEditor } from "../components/IngredientEditor";
import { ingredientDraftsFromIngredients, sanitiseIngredientDrafts, type IngredientDraft } from "../ingredients";
import {
  calendarEventsToDeadlines,
  icsSubscriptionHints,
  importFromSubscriptionUrl,
  importGoogleCalendar,
  importOutlookCalendar,
  isSubscriptionUrl,
  parseICSText,
} from "../calendarImport";
import type { CalendarToken, IcsSubscription } from "../sessionPersistence";
import type { TrackPrototypeEvent } from "../analytics";

function Progress({ step }: { step: number }) {
  const labels = ["Calendar", "About you", "Preferences"];

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

function PreferenceSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-4", className)}>
      <div className="mb-4">
        <h3 className="text-base font-bold text-stone-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function Onboarding({
  setOnboarded,
  setScreen,
  prefs,
  setPrefs,
  setDeadlines,
  setCalendarEvents,
  selectedSources,
  setSelectedSources,
  calendarProvider,
  setCalendarProvider,
  icsSubscriptions,
  setIcsSubscriptions,
  calendarTokens,
  setCalendarTokens,
  sessionId,
  track,
}: {
  setOnboarded: (onboarded: boolean) => void;
  setScreen: (screen: Screen) => void;
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  deadlines: Deadline[];
  setDeadlines: (deadlines: Deadline[]) => void;
  setCalendarEvents: (events: CalendarEvent[]) => void;
  selectedSources: string[];
  setSelectedSources: (sources: string[]) => void;
  calendarProvider: CalendarProvider;
  setCalendarProvider: (provider: CalendarProvider) => void;
  icsSubscriptions: IcsSubscription[];
  setIcsSubscriptions: (subs: IcsSubscription[]) => void;
  calendarTokens: CalendarToken[];
  setCalendarTokens: (tokens: CalendarToken[]) => void;
  sessionId: string;
  track: TrackPrototypeEvent;
}) {
  const [step, setStep] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [availableIngredientDrafts, setAvailableIngredientDrafts] = useState(() => ingredientDraftsFromIngredients(prefs.availableIngredients, false));
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step2Attempted, setStep2Attempted] = useState(false);

  function goToStep(nextStep: number) {
    setStep(nextStep);
    setAnimationKey(k => k + 1);
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  function handleImportedEvents(events: CalendarEvent[], source: string) {
    setCalendarEvents(events);
    const asDeadlines = calendarEventsToDeadlines(events);
    if (asDeadlines.length > 0) {
      setDeadlines(asDeadlines);
      setImportMessage(`${events.length} event${events.length === 1 ? "" : "s"} imported from ${source}.`);
    } else {
      setImportMessage("No events found. Showing the example deadline week instead.");
    }
    track("calendar_imported", { source, event_count: events.length });
  }

  function loadICS(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const events = parseICSText(String(reader.result));
      handleImportedEvents(events, "ics");
    };
    reader.readAsText(file);
  }

  async function connectOAuth() {
    setImporting(true);
    setImportMessage("");
    track("calendar_provider_connect_clicked", { provider: calendarProvider });

    try {
      const result = calendarProvider === "google"
        ? await importGoogleCalendar(sessionId)
        : await importOutlookCalendar(sessionId);
      handleImportedEvents(result.events, calendarProvider);
      if (result.refreshToken) {
        const provider = calendarProvider as "google" | "outlook";
        const newToken: CalendarToken = {
          provider,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? "",
          addedAt: new Date().toISOString(),
        };
        setCalendarTokens([...calendarTokens.filter((t) => t.provider !== provider), newToken]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setImportMessage(message);
      track("calendar_import_error", { provider: calendarProvider, error: message });
    } finally {
      setImporting(false);
    }
  }

  async function connectSubscriptionUrl() {
    if (!isSubscriptionUrl(subscriptionUrl)) {
      setImportMessage("Enter a valid webcal:// or https:// calendar URL.");
      return;
    }
    setImporting(true);
    setImportMessage("");
    track("calendar_subscription_url_imported", { provider: calendarProvider });

    try {
      const events = await importFromSubscriptionUrl(subscriptionUrl, calendarProvider);
      handleImportedEvents(events, calendarProvider);
      const newSub: IcsSubscription = { url: subscriptionUrl.trim(), source: calendarProvider, addedAt: new Date().toISOString() };
      setIcsSubscriptions([...icsSubscriptions.filter((s) => s.url !== newSub.url), newSub]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setImportMessage(message);
      track("calendar_import_error", { provider: calendarProvider, error: message });
    } finally {
      setImporting(false);
    }
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

  function updateAvailableIngredients(nextDrafts: IngredientDraft[]) {
    setAvailableIngredientDrafts(nextDrafts);
    setPrefs({ ...prefs, availableIngredients: sanitiseIngredientDrafts(nextDrafts) });
  }

  function scrollToFirstError(container: HTMLElement | null) {
    requestAnimationFrame(() => {
      const firstError = container?.querySelector("[data-field-error] input, [data-field-error] button");
      if (firstError instanceof HTMLElement) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
        firstError.focus({ preventScroll: true });
      }
    });
  }

  function finish() {
    track("onboarding_completed", {
      recipe_sources: selectedSources,
      dietary_requirements: prefs.dietary,
      available_ingredient_count: prefs.availableIngredients.length,
      kitchen_access: prefs.kitchen,
      cooking_ability: prefs.cookingAbility,
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
          <Card key={animationKey} className="animate-onboarding-enter gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 1 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">Connect your calendar</h2>
            <p className="mt-2 text-stone-600">We use calendar titles and times to spot likely busy study days and lower cooking effort around them.</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              {calendarProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    track("calendar_source_selected", { source: provider.id });
                    setCalendarProvider(provider.id);
                  }}
                  className={cn("rounded-lg border p-4 text-left transition", calendarProvider === provider.id ? "border-emerald-600 bg-emerald-50" : "border-stone-200 hover:border-stone-300")}
                >
                  <CalendarDays size={18} className={cn("mb-2", calendarProvider === provider.id ? "text-emerald-700" : "text-stone-400")} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold">{provider.name}</p>
                    {provider.recommended && <Badge tone="green">Recommended</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{provider.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
              {(calendarProvider === "google" || calendarProvider === "outlook") && (
                <>
                  <AppButton type="button" onClick={connectOAuth} disabled={importing} className="w-full justify-center py-3 text-base">
                    <CalendarDays size={18} /> {importing ? "Connecting…" : `Sign in with ${calendarProvider === "google" ? "Google" : "Microsoft"}`}
                  </AppButton>
                  {calendarProvider === "outlook" && (
                    <p className="mt-2 text-xs font-medium text-amber-700">University and organisation accounts may block sign-in — use a subscription link below instead.</p>
                  )}
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-stone-200" />
                    <span className="text-xs font-medium text-stone-400">or use a subscription link</span>
                    <div className="h-px flex-1 bg-stone-200" />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <Input
                  value={subscriptionUrl}
                  onChange={(e) => setSubscriptionUrl(e.target.value)}
                  placeholder="webcal://… or https://…"
                  className="h-auto flex-1 rounded-lg border-stone-200 bg-white p-3 text-sm"
                />
                <AppButton type="button" variant="secondary" onClick={connectSubscriptionUrl} disabled={importing || !subscriptionUrl.trim()}>
                  {importing ? "Fetching…" : "Import"}
                </AppButton>
              </div>
              <p className="mt-2 text-xs text-stone-400">{icsSubscriptionHints[calendarProvider]}</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-stone-200" />
                <span className="text-xs font-medium text-stone-400">or upload a file</span>
                <div className="h-px flex-1 bg-stone-200" />
              </div>
              <AppButton type="button" variant="secondary" onClick={() => fileRef.current?.click()} className="w-full justify-center py-3 text-base">
                <Import size={18} /> Upload .ics file
              </AppButton>
              <Input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={loadICS} />
            </div>
            {importMessage && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{importMessage}</p>}
            <div className="mt-7 flex justify-end">
              <AppButton onClick={() => { track("onboarding_step_completed", { step: 0, next_step: 1, calendar_choice: calendarProvider }); goToStep(1); }}>
                Continue <ArrowRight size={16} />
              </AppButton>
            </div>
          </Card>
        )}
        {step === 1 && (
          <Card key={animationKey} ref={step1Ref} className="animate-onboarding-enter gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 2 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">About you</h2>
            <p className="mt-2 text-stone-600">Help us understand your situation so suggestions actually fit your life.</p>
            <div className="mt-5 divide-y divide-stone-200 rounded-lg border border-stone-200 px-4 sm:px-5">
              <PreferenceSection
                title="Cooking ability"
                description="Choose the closest level so recipe suggestions match the techniques you are comfortable with."
              >
                <SelectField
                  label="Current cooking ability"
                  value={prefs.cookingAbility}
                  onChange={(cookingAbility) => { track("onboarding_preference_changed", { field: "cooking_ability", value: cookingAbility }); setPrefs({ ...prefs, cookingAbility }); }}
                  options={cookingAbilities.map((ability) => ({ value: ability.id, label: `${ability.name} - ${ability.description}` }))}
                  placeholder="Select cooking ability"
                  required
                  error={step1Attempted && !prefs.cookingAbility}
                  errorMessage="Please select your cooking ability"
                />
              </PreferenceSection>
              <PreferenceSection
                title="What do you usually eat?"
                description="Pick the meals you reach for most. This helps us suggest things you'll actually make — not recipes that require skills you don't need."
              >
                <ChoiceGroup
                  title=""
                  options={likes}
                  selected={prefs.likes}
                  onToggle={(value) => toggle(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
                  onAdd={(value) => addSelection(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
                  addPlaceholder="Add a meal you often eat"
                />
              </PreferenceSection>
              <PreferenceSection
                title="Anything you'd rather avoid?"
                description="Ingredients or foods you dislike. These are soft filters — we'll still show them if there's no better option."
              >
                <ChoiceGroup
                  title=""
                  options={dislikes}
                  selected={prefs.dislikes}
                  onToggle={(value) => toggle(prefs.dislikes, value, (next) => setPrefs({ ...prefs, dislikes: next }))}
                  onAdd={(value) => addSelection(prefs.dislikes, value, (next) => setPrefs({ ...prefs, dislikes: next }))}
                  addPlaceholder="Add an ingredient you dislike"
                />
              </PreferenceSection>
              <PreferenceSection
                title="What ingredients do you already have?"
                description="Add staples with the same ingredient controls used for recipes so shopping can focus on what you still need."
              >
                <IngredientEditor
                  ingredients={availableIngredientDrafts}
                  onChange={updateAvailableIngredients}
                  allowEmpty
                  emptyMessage="No ingredients added yet."
                />
              </PreferenceSection>
            </div>
            {step1Attempted && !prefs.cookingAbility && (
              <p className="mt-5 text-center text-sm font-medium text-red-600">
                Please fill in all required fields
              </p>
            )}
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="mb-3 text-sm text-stone-600 sm:mb-0">You can update these any time in settings.</p>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0">
                <AppButton variant="ghost" className="justify-center" onClick={() => { track("onboarding_step_back_clicked", { step: 1, next_step: 0 }); goToStep(0); }}>
                  <ArrowLeft size={16} /> Back
                </AppButton>
                <AppButton className="justify-center py-3" onClick={() => {
                  if (!prefs.cookingAbility) {
                    setStep1Attempted(true);
                    scrollToFirstError(step1Ref.current);
                    return;
                  }
                  track("onboarding_step_completed", { step: 1, next_step: 2 });
                  goToStep(2);
                }}>
                  Continue <ArrowRight size={16} />
                </AppButton>
              </div>
            </div>
          </Card>
        )}
        {step === 2 && (
          <Card key={animationKey} ref={step2Ref} className="animate-onboarding-enter gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 3 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">What works for you?</h2>
            <p className="mt-2 text-stone-600">Set hard limits once. Recommendations stay inside them.</p>
            <div className="mt-5 divide-y divide-stone-200 rounded-lg border border-stone-200 px-4 sm:px-5">
              <PreferenceSection
                title="Cooking time"
                description="Set the maximum effort for a normal deadline-week meal. This is the control Autopilot uses before suggesting anything."
              >
                <label className="block">
                  <span className="text-sm font-semibold">Maximum cooking time</span>
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
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
                      className="w-full"
                    />
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-emerald-950">
                        Current limit: <strong>{formatCookingLimit(prefs.maxTime)}</strong>
                      </p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={prefs.maxTime === null}
                        onClick={() => { const next = prefs.maxTime === null; track("onboarding_preference_changed", { field: "max_time_unlimited", value: next }); setPrefs({ ...prefs, maxTime: next ? 180 : null }); }}
                        className="flex items-center gap-2 text-sm font-medium text-stone-700"
                      >
                        <span className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200", prefs.maxTime === null ? "bg-emerald-600" : "bg-stone-200")}>
                          <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out", prefs.maxTime === null ? "translate-x-4" : "translate-x-0")} />
                        </span>
                        Unlimited
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-emerald-900">
                      Choose 0 to 3 hours, or remove the limit.
                    </p>
                  </div>
                </label>
              </PreferenceSection>

              <PreferenceSection
                title="Budget and access"
                description="These fields keep the plan realistic for shared kitchens, campus fallback meals and nearby shopping."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold">Weekly food budget</span>
                    <div className="mt-2 flex items-center rounded-lg border border-stone-200 px-3">
                      <span className="text-stone-500">£</span>
                      <Input
                        value={prefs.budget === 0 ? "" : prefs.budget}
                        onChange={(event) => setPrefs({ ...prefs, budget: event.target.value === "" ? 0 : Number(event.target.value) })}
                        onKeyDown={(event) => { if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); }}
                        onBlur={() => track("onboarding_preference_changed", { field: "budget", value: prefs.budget })}
                        type="number"
                        min="1"
                        className="h-auto border-0 p-3 shadow-none focus-visible:ring-0"
                      />
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
                    required
                    error={step2Attempted && !prefs.kitchen}
                    errorMessage="Please select your kitchen access"
                  />
                  <SelectField
                    label="Your university"
                    value={prefs.university}
                    onChange={(university) => { track("onboarding_preference_changed", { field: "university", value: university }); setPrefs({ ...prefs, university }); }}
                    options={universities.map((university) => ({ value: university, label: university }))}
                    required
                    error={step2Attempted && !prefs.university}
                    errorMessage="Please select your university"
                  />
                  <Field label="Location (postcode)" value={prefs.postcode} onChange={(postcode) => setPrefs({ ...prefs, postcode })} onBlur={() => track("onboarding_preference_changed", { field: "postcode" })} placeholder="e.g. SW7 2AZ" />
                </div>
              </PreferenceSection>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              <p className="font-semibold">Why we ask for university and area</p>
              <p className="mt-1">
                University helps suggest campus fallback meals. Postcode is used as a general area signal for nearby shops and can be replaced with a broad campus postcode.
              </p>
              <button type="button" onClick={() => track("privacy_policy_opened", { source: "onboarding_location" })} className="mt-2 font-semibold underline underline-offset-4">
                View privacy summary
              </button>
            </div>
            <div className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 px-4 sm:px-5">
              <PreferenceSection title="Dietary safety" description="Restrictions and allergens are treated as hard filters before recipes are suggested.">
                <div className="grid gap-5">
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
                </div>
              </PreferenceSection>
              <PreferenceSection
                title="Planning Priorities"
                description="What should we optimise for? You can change this later."
              >
                <div className="space-y-3">
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
                        className={cn("flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left", active ? "border-emerald-600 bg-emerald-50" : "border-stone-200")}
                      >
                        <div>
                          <p className="font-semibold">{source.name}</p>
                          <p className="text-sm text-stone-500">{source.desc}</p>
                        </div>
                        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", active ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300")}>{active && <Check size={14} />}</div>
                      </button>
                    );
                  })}
                </div>
              </PreferenceSection>
            </div>
            {step2Attempted && (!prefs.kitchen || !prefs.university) && (
              <p className="mt-5 text-center text-sm font-medium text-red-600">
                Please fill in all required fields
              </p>
            )}
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="mb-3 text-sm text-stone-600 sm:mb-0">Preferences are ready. Create your deadline-week plan when everything looks right.</p>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0">
                <AppButton variant="ghost" className="justify-center" onClick={() => { track("onboarding_step_back_clicked", { step: 2, next_step: 1 }); goToStep(1); }}>
                  <ArrowLeft size={16} /> Back
                </AppButton>
                <AppButton className="justify-center py-3" onClick={() => {
                  if (!prefs.kitchen || !prefs.university) {
                    setStep2Attempted(true);
                    scrollToFirstError(step2Ref.current);
                    return;
                  }
                  finish();
                }}>
                  Create my plan <Sparkles size={16} />
                </AppButton>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
