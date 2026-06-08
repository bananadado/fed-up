import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, Import, Sparkles } from "lucide-react";

import fedUpLogo from "@/assets/fed-up-logo.svg";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allergens, calendarProviders, cookingAbilities, dietary, dislikes, likes } from "../data";
import type { CalendarEvent, CalendarProvider, Deadline, Preferences, Screen } from "../types";
import { AppButton, Badge, ChoiceGroup, Field, SelectField } from "../components/primitives";
import { UniversityField } from "../components/UniversityField";
import { formatCookingLimit } from "../utils";
import { IngredientEditor } from "../components/IngredientEditor";
import { PlanningPriorityControls } from "../components/PlanningPriorityControls";
import { ingredientDraftsFromIngredients, sanitiseIngredientDrafts, type IngredientDraft } from "../ingredients";
import {
  icsSubscriptionHints,
  importFromSubscriptionUrl,
  importGoogleCalendar,
  importOutlookCalendar,
  isSubscriptionUrl,
  parseICSText,
  resolveDeadlinesFromEvents,
} from "../calendarImport";
import type { CalendarToken, IcsSubscription } from "../sessionPersistence";
import type { TrackPrototypeEvent } from "../analytics";
import { filterFoodPreferenceOptions } from "../preferenceOptions";

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

function InfoTooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label="More information"
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-stone-300 bg-white text-[11px] font-bold text-stone-400 hover:border-emerald-400 hover:text-emerald-700"
      >
        ?
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-lg border border-stone-200 bg-white p-3 text-xs leading-5 text-stone-600 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

export function Onboarding({
  setOnboarded,
  setScreen,
  prefs,
  setPrefs,
  setDeadlines,
  calendarEvents,
  setCalendarEvents,
  calendarProvider,
  setCalendarProvider,
  icsSubscriptions,
  setIcsSubscriptions,
  calendarTokens,
  setCalendarTokens,
  sessionId,
  track,
  setCalendarSkipped,
}: {
  setOnboarded: (onboarded: boolean) => void;
  setScreen: (screen: Screen) => void;
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  setDeadlines: (deadlines: Deadline[]) => void;
  calendarEvents: CalendarEvent[];
  setCalendarEvents: (events: CalendarEvent[]) => void;
  calendarProvider: CalendarProvider;
  setCalendarProvider: (provider: CalendarProvider) => void;
  icsSubscriptions: IcsSubscription[];
  setIcsSubscriptions: (subs: IcsSubscription[]) => void;
  calendarTokens: CalendarToken[];
  setCalendarTokens: (tokens: CalendarToken[]) => void;
  sessionId: string;
  track: TrackPrototypeEvent;
  setCalendarSkipped: (skipped: boolean) => void;
}) {
  const [step, setStep] = useState(() => {
    try {
      const saved = sessionStorage.getItem("deadlineFood:onboardingStep");
      if (saved !== null) { const n = parseInt(saved, 10); if (n >= 0 && n <= 2) return n; }
    } catch { /* sessionStorage unavailable */ }
    return 0;
  });
  const [animationKey, setAnimationKey] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedDeadlines, setImportedDeadlines] = useState<Deadline[]>([]);
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [availableIngredientDrafts, setAvailableIngredientDrafts] = useState(() => ingredientDraftsFromIngredients(prefs.availableIngredients, false));
  const [step1Attempted, setStep1Attempted] = useState(false);
  const [step2Attempted, setStep2Attempted] = useState(false);
  const [showCalendarSkipConfirm, setShowCalendarSkipConfirm] = useState(false);
  const [showStep1SkipConfirm, setShowStep1SkipConfirm] = useState(false);
  const [showStep2SkipConfirm, setShowStep2SkipConfirm] = useState(false);
  const filteredLikes = filterFoodPreferenceOptions(likes, prefs.dietary, "likes");
  const filteredDislikes = filterFoodPreferenceOptions(dislikes, prefs.dietary, "dislikes");
  const prefsRef = useRef(prefs);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  function updatePrefs(patch: Partial<Preferences>) {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
  }

  function goToStep(nextStep: number) {
    setStep(nextStep);
    setAnimationKey(k => k + 1);
    try { sessionStorage.setItem("deadlineFood:onboardingStep", String(nextStep)); } catch { /* ignore */ }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  async function handleImportedEvents(events: CalendarEvent[], source: string) {
    setCalendarEvents(events);
    if (events.length > 0) setCalendarSkipped(false);
    const asDeadlines = await resolveDeadlinesFromEvents(events);
    setImportedDeadlines(asDeadlines);
    if (asDeadlines.length > 0) {
      setDeadlines(asDeadlines);
      setImportMessage(`${events.length} event${events.length === 1 ? "" : "s"} imported from ${source}.`);
    } else {
      setImportMessage("No calendar events were found in that import.");
    }
    track("calendar_imported", { source, event_count: events.length });
  }

  function loadICS(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const events = parseICSText(String(reader.result));
      void handleImportedEvents(events, "ics");
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
      setImportError(false);
      await handleImportedEvents(result.events, calendarProvider);
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
      const rawMessage = error instanceof Error ? error.message : "Import failed";
      setImportError(true);
      setImportMessage("We couldn't connect — you can set this up later in Settings.");
      track("calendar_import_error", { provider: calendarProvider, error: rawMessage });
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
      setImportError(false);
      await handleImportedEvents(events, calendarProvider);
      const newSub: IcsSubscription = { url: subscriptionUrl.trim(), source: calendarProvider, addedAt: new Date().toISOString() };
      setIcsSubscriptions([...icsSubscriptions.filter((s) => s.url !== newSub.url), newSub]);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Import failed";
      setImportError(true);
      setImportMessage("We couldn't connect — you can set this up later in Settings.");
      track("calendar_import_error", { provider: calendarProvider, error: rawMessage });
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
    updatePrefs({ availableIngredients: sanitiseIngredientDrafts(nextDrafts) });
  }

  function finish() {
    try { sessionStorage.removeItem("deadlineFood:onboardingStep"); } catch { /* ignore */ }
    track("onboarding_completed", {
      dietary_requirements: prefs.dietary,
      available_ingredient_count: prefs.availableIngredients.length,
      kitchen_access: prefs.kitchen,
      cooking_ability: prefs.cookingAbility,
      budget_pounds: prefs.budget,
    });
    setOnboarded(true);
    setScreen("dashboard");
  }

  function continueFromCalendarStep() {
    if (calendarEvents.length === 0) {
      track("calendar_skip_confirmation_shown", { provider: calendarProvider });
      setShowCalendarSkipConfirm(true);
      return;
    }
    track("onboarding_step_completed", { step: 0, next_step: 1, calendar_choice: calendarProvider });
    goToStep(1);
  }

  function confirmCalendarSkip() {
    track("calendar_skip_confirmed", { provider: calendarProvider });
    setShowCalendarSkipConfirm(false);
    track("onboarding_step_completed", { step: 0, next_step: 1, calendar_choice: calendarProvider, calendar_skipped: true });
    setCalendarSkipped(true);
    goToStep(1);
  }

  return (
    <div className="min-h-screen bg-[#faf9f5] px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex items-center">
          <img src={fedUpLogo} alt="Fed Up" className="h-8 w-auto" />
        </div>
        <Progress step={step} />
        {step === 0 && (
          <Card key={animationKey} className="animate-onboarding-enter gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 1 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">Connect your calendar</h2>
            <p className="mt-2 text-stone-600">We use calendar titles and times to spot likely busy study days. This is optional — you can connect later in Settings.</p>
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
              <div className="flex items-center gap-2">
                <InfoTooltip>
                  <p className="font-semibold text-stone-700">Calendar subscription link</p>
                  <p className="mt-1">A <span className="font-medium">webcal://</span> or <span className="font-medium">https://</span> URL your calendar app provides so other apps can sync your events.</p>
                  <p className="mt-1.5 font-medium text-stone-500">Where to find it:</p>
                  <ul className="mt-0.5 space-y-0.5 text-stone-500">
                    <li><span className="font-medium">Google:</span> Settings → your calendar → "Secret address in iCal format"</li>
                    <li><span className="font-medium">Outlook:</span> Calendar settings → Share → Get a link</li>
                    <li><span className="font-medium">University:</span> check your timetable portal for a "subscribe" or "iCal" option</li>
                  </ul>
                </InfoTooltip>
                <div className="flex flex-1 gap-2">
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
              </div>
              <p className="mt-2 text-xs text-stone-400">{icsSubscriptionHints[calendarProvider]}</p>
              <div className="mt-4 flex items-center gap-2">
                <InfoTooltip>
                  <p className="font-semibold text-stone-700">ICS / .ics file</p>
                  <p className="mt-1">A standard calendar export file. Download one from:</p>
                  <ul className="mt-0.5 space-y-0.5 text-stone-500">
                    <li><span className="font-medium">Google:</span> Settings → Import &amp; export → Export</li>
                    <li><span className="font-medium">Outlook:</span> File → Save calendar</li>
                    <li><span className="font-medium">University timetable:</span> look for "Export" or "Download"</li>
                  </ul>
                  <p className="mt-1.5 text-stone-400">Note: a one-off snapshot — it won't stay in sync. Use a subscription link above for live updates.</p>
                </InfoTooltip>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600"
                >
                  <Import size={14} /> Upload .ics file
                </button>
              </div>
              <Input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={loadICS} />
            </div>
            {importMessage && (
              <p className={cn("mt-4 rounded-lg p-3 text-sm", importError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>
                {importMessage}
              </p>
            )}
            {importError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm text-rose-800 font-medium">We couldn't connect to {calendarProvider === "google" ? "Google" : "Microsoft"}.</p>
                <p className="mt-1 text-sm text-rose-700">You can skip this step and add your workload manually on the Calendar screen, or try again later in Settings.</p>
                <div className="mt-3 flex gap-2">
                  <AppButton variant="secondary" onClick={() => { track("calendar_skip_confirmed", { provider: calendarProvider }); setShowCalendarSkipConfirm(true); }}>
                    Skip for now
                  </AppButton>
                  <AppButton variant="secondary" onClick={() => { track("calendar_retry_clicked", { provider: calendarProvider }); setImportError(false); setImportMessage(""); }}>
                    Try again
                  </AppButton>
                </div>
              </div>
            )}
            <p className="mt-4 text-sm text-stone-500">
              Adding a calendar is optional. You can import calendar events any time through Settings or the Calendar menu.
            </p>
            {calendarEvents.length > 0 && (
              <div className="mt-7 rounded-lg bg-stone-50 p-4">
                {(() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const futureEvents = importedDeadlines
                    .filter((d) => d.rawDate ? d.rawDate >= today : true)
                    .sort((a, b) => (a.rawDate ?? "").localeCompare(b.rawDate ?? ""));
                  const shown = futureEvents.slice(0, 5);
                  return (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">Detected study-load signals</p>
                        <Badge tone="amber">{futureEvents.length} found</Badge>
                      </div>
                      {futureEvents.length > 5 && (
                        <p className="mb-2 text-xs text-stone-500">Showing the next 5 closest events</p>
                      )}
                      <div className="space-y-2">
                        {shown.map((deadline) => (
                          <div key={deadline.id} className="flex items-center justify-between rounded-lg bg-white p-3 text-sm">
                            <div>
                              <p className="font-medium">{deadline.title}</p>
                              <p className="text-stone-500">{deadline.date}</p>
                            </div>
                            <span className="text-stone-500">{deadline.time}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            <div className="mt-7 flex justify-end">
              <AppButton variant={calendarEvents.length === 0 ? "secondary" : undefined} onClick={continueFromCalendarStep}>
                {calendarEvents.length === 0 ? "Skip for now" : "Continue"} <ArrowRight size={16} />
              </AppButton>
            </div>
          </Card>
        )}
        {showCalendarSkipConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-skip-title"
            className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4"
          >
            <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 id="calendar-skip-title" className="text-lg font-bold text-stone-950">Continue without a calendar?</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    No calendar has been imported, so Fed Up will not adapt meals around your real events yet. You can import calendar events any time through Settings or the Calendar menu.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <AppButton type="button" variant="secondary" className="justify-center" onClick={() => setShowCalendarSkipConfirm(false)}>
                  Go back
                </AppButton>
                <AppButton type="button" className="justify-center" onClick={confirmCalendarSkip}>
                  Continue anyway
                </AppButton>
              </div>
            </div>
          </div>
        )}
        {showStep1SkipConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="step1-skip-title"
            className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4"
          >
            <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 id="step1-skip-title" className="text-lg font-bold text-stone-950">Skip cooking ability?</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Your cooking level helps us filter out recipes that are too complex or time-consuming. Without it, suggestions may not match what you can realistically make. You can set it any time in Settings.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <AppButton type="button" variant="secondary" className="justify-center" onClick={() => setShowStep1SkipConfirm(false)}>
                  Go back
                </AppButton>
                <AppButton type="button" className="justify-center" onClick={() => {
                  setShowStep1SkipConfirm(false);
                  track("onboarding_step_completed", { step: 1, next_step: 2, skipped_cooking_ability: true });
                  goToStep(2);
                }}>
                  Continue anyway
                </AppButton>
              </div>
            </div>
          </div>
        )}
        {showStep2SkipConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="step2-skip-title"
            className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4"
          >
            <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 id="step2-skip-title" className="text-lg font-bold text-stone-950">
                    {!prefs.kitchen && !prefs.university ? "Skip kitchen access and university?" : !prefs.kitchen ? "Skip kitchen access?" : "Skip university?"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {!prefs.kitchen && !prefs.university
                      ? "Kitchen access and university help us suggest meals that fit your actual setup and find campus fallback options."
                      : !prefs.kitchen
                        ? "Kitchen access helps us avoid suggesting recipes you can't make where you are."
                        : "Your university helps us find campus meal fallbacks near you."
                    }{" "}You can set {!prefs.kitchen && !prefs.university ? "them" : "it"} any time in Settings.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <AppButton type="button" variant="secondary" className="justify-center" onClick={() => setShowStep2SkipConfirm(false)}>
                  Go back
                </AppButton>
                <AppButton type="button" className="justify-center" onClick={() => {
                  setShowStep2SkipConfirm(false);
                  finish();
                }}>
                  Continue anyway
                </AppButton>
              </div>
            </div>
          </div>
        )}
        {step === 1 && (
          <Card key={animationKey} className="animate-onboarding-enter gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
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
                  onChange={(cookingAbility) => { track("onboarding_preference_changed", { field: "cooking_ability", value: cookingAbility }); updatePrefs({ cookingAbility }); }}
                  options={cookingAbilities.map((ability) => ({ value: ability.id, label: `${ability.name} - ${ability.description}` }))}
                  placeholder="Select cooking ability"
                  required
                  error={step1Attempted && !prefs.cookingAbility}
                  errorMessage="Please select your cooking ability"
                />
              </PreferenceSection>
              <PreferenceSection title="Dietary safety" description="Restrictions and allergens are treated as hard filters before recipes are suggested.">
                <div className="grid gap-5">
                  <ChoiceGroup
                    title="Dietary requirements (leave blank if none)"
                    options={dietary}
                    selected={prefs.dietary}
                    onToggle={(value) => toggle(prefs.dietary, value, (next) => updatePrefs({ dietary: next }))}
                    onAdd={(value) => addSelection(prefs.dietary, value, (next) => updatePrefs({ dietary: next }))}
                    addPlaceholder="Add a dietary requirement"
                  />
                  <ChoiceGroup
                    title="Allergic to / cannot eat"
                    options={allergens}
                    selected={prefs.allergens}
                    onToggle={(value) => toggle(prefs.allergens, value, (next) => updatePrefs({ allergens: next }))}
                    onAdd={(value) => addSelection(prefs.allergens, value, (next) => updatePrefs({ allergens: next }))}
                    addPlaceholder="Add an allergy or avoided ingredient"
                    danger
                  />
                </div>
              </PreferenceSection>
              <PreferenceSection
                title="What do you usually eat?"
                description="Pick the meals you reach for most. This helps us suggest things you'll actually make — not recipes that require skills you don't need."
              >
                <ChoiceGroup
                  title=""
                  options={filteredLikes}
                  selected={prefs.likes}
                  onToggle={(value) => toggle(prefs.likes, value, (next) => updatePrefs({ likes: next }))}
                  onAdd={(value) => addSelection(prefs.likes, value, (next) => updatePrefs({ likes: next }))}
                  addPlaceholder="Add a meal you often eat"
                />
              </PreferenceSection>
              <PreferenceSection
                title="Anything you'd rather avoid?"
                description="Ingredients or foods you dislike. These are soft filters — we'll still show them if there's no better option."
              >
                <ChoiceGroup
                  title=""
                  options={filteredDislikes}
                  selected={prefs.dislikes}
                  onToggle={(value) => toggle(prefs.dislikes, value, (next) => updatePrefs({ dislikes: next }))}
                  onAdd={(value) => addSelection(prefs.dislikes, value, (next) => updatePrefs({ dislikes: next }))}
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
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="mb-3 text-sm text-stone-600 sm:mb-0">You can update these any time in settings.</p>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0">
                <AppButton variant="ghost" className="justify-center" onClick={() => { track("onboarding_step_back_clicked", { step: 1, next_step: 0 }); goToStep(0); }}>
                  <ArrowLeft size={16} /> Back
                </AppButton>
                <AppButton className="justify-center py-3" onClick={() => {
                  if (!prefs.cookingAbility) {
                    setStep1Attempted(true);
                    setShowStep1SkipConfirm(true);
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
          <Card key={animationKey} className="animate-onboarding-enter gap-0 rounded-lg border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <Badge tone="green">Step 3 of 3</Badge>
            <h2 className="mt-4 text-3xl font-bold">What works for you?</h2>
            <p className="mt-2 text-stone-600">Set hard limits once. Recommendations stay inside them.</p>
            <div className="mt-5 divide-y divide-stone-200 rounded-lg border border-stone-200 px-4 sm:px-5">
              <PreferenceSection
                title="Cooking time"
                description="Set the maximum effort for a normal deadline-week meal. This is the control Fed Up uses before suggesting anything."
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
                      onChange={(event) => updatePrefs({ maxTime: +event.target.value })}
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
                        onClick={() => { const next = prefs.maxTime === null; track("onboarding_preference_changed", { field: "max_time_unlimited", value: next }); updatePrefs({ maxTime: next ? 180 : null }); }}
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
                        onChange={(event) => updatePrefs({ budget: event.target.value === "" ? 0 : Number(event.target.value) })}
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
                    onChange={(kitchen) => { track("onboarding_preference_changed", { field: "kitchen", value: kitchen }); updatePrefs({ kitchen }); }}
                    options={[
                      { value: "full", label: "Full kitchen" },
                      { value: "shared", label: "Shared kitchen (often busy)" },
                      { value: "hob", label: "Hob only (no oven)" },
                      { value: "limited", label: "Microwave / kettle only" },
                      { value: "catered", label: "Catered hall" },
                      { value: "none", label: "No kitchen access" },
                    ]}
                    required
                    error={step2Attempted && !prefs.kitchen}
                    errorMessage="Please select your kitchen access"
                  />
                  <UniversityField
                    label="Your university"
                    value={prefs.university}
                    onChange={(university) => { track("onboarding_preference_changed", { field: "university", value: university }); updatePrefs({ university }); }}
                    required
                    error={step2Attempted && !prefs.university}
                    errorMessage="Please select your university"
                  />
                  <Field label="Location (postcode)" value={prefs.postcode} onChange={(postcode) => updatePrefs({ postcode })} onBlur={() => track("onboarding_preference_changed", { field: "postcode" })} placeholder="e.g. SW7 2AZ" />
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
              <PreferenceSection
                title="Planning window"
                description="How far ahead should Fed Up plan your meals? You can change this later."
              >
                <div className="grid grid-cols-4 gap-2">
                  {[7, 14, 21, 28].map((days) => {
                    const active = prefs.planningHorizonDays === days;
                    const wk = days / 7;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => { track("onboarding_preference_changed", { field: "planning_horizon_days", value: days }); updatePrefs({ planningHorizonDays: days }); }}
                        className={cn("rounded-lg border px-2 py-2.5 text-sm font-medium transition", active ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300")}
                      >
                        {wk} {wk === 1 ? "week" : "weeks"}
                      </button>
                    );
                  })}
                </div>
              </PreferenceSection>
              <PreferenceSection
                title="Planning Priorities"
                description="What should we optimise for? You can change this later."
              >
                <PlanningPriorityControls prefs={prefs} setPrefs={setPrefs} track={track} source="onboarding" />
              </PreferenceSection>
            </div>
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="mb-3 text-sm text-stone-600 sm:mb-0">Preferences are ready. Create your deadline-week plan when everything looks right.</p>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0">
                <AppButton variant="ghost" className="justify-center" onClick={() => { track("onboarding_step_back_clicked", { step: 2, next_step: 1 }); goToStep(1); }}>
                  <ArrowLeft size={16} /> Back
                </AppButton>
                <AppButton className="justify-center py-3" onClick={() => {
                  if (!prefs.kitchen || !prefs.university) {
                    setStep2Attempted(true);
                    setShowStep2SkipConfirm(true);
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
