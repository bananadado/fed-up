import { useRef, useState } from "react";
import { Import, RotateCcw } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { allergens, calendarProviders, dietary, dislikes, likes, universities } from "../data";
import type { CalendarEvent, CalendarProvider, Deadline, Preferences, Screen } from "../types";
import { AppButton, ChoiceGroup, Field, SelectField } from "../components/primitives";
import { formatCookingLimit } from "../utils";
import {
  calendarEventsToDeadlines,
  icsSubscriptionHints,
  importFromSubscriptionUrl,
  importGoogleCalendar,
  importOutlookCalendar,
  isGoogleConfigured,
  isOutlookConfigured,
  isSubscriptionUrl,
  parseICSText,
} from "../calendarImport";
import type { TrackPrototypeEvent } from "../analytics";

export function SettingsScreen({
  prefs,
  setPrefs,
  setScreen,
  calendarProvider,
  setCalendarProvider,
  setDeadlines,
  calendarEvents,
  setCalendarEvents,
  track,
}: {
  prefs: Preferences;
  setPrefs: (prefs: Preferences) => void;
  setScreen: (screen: Screen) => void;
  calendarProvider: CalendarProvider;
  setCalendarProvider: (provider: CalendarProvider) => void;
  setDeadlines: (deadlines: Deadline[]) => void;
  calendarEvents: CalendarEvent[];
  setCalendarEvents: (events: CalendarEvent[]) => void;
  track: TrackPrototypeEvent;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [subscriptionUrl, setSubscriptionUrl] = useState("");

  function handleImportedEvents(events: CalendarEvent[], source: string) {
    setCalendarEvents(events);
    const asDeadlines = calendarEventsToDeadlines(events);
    if (asDeadlines.length > 0) {
      setDeadlines(asDeadlines);
      setImportMessage(`${events.length} event${events.length === 1 ? "" : "s"} imported from ${source}.`);
    } else {
      setImportMessage("No events found.");
    }
    track("calendar_imported", { source, event_count: events.length });
  }

  function handleICSImport(event: React.ChangeEvent<HTMLInputElement>) {
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
      const events = calendarProvider === "google"
        ? await importGoogleCalendar()
        : await importOutlookCalendar();
      handleImportedEvents(events, calendarProvider);
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
    track("settings_choice_toggled", { value, selected });
    update(selected ? [...values, value] : values.filter((item) => item !== value));
  }

  function addSelection(values: string[], value: string, update: (next: string[]) => void) {
    const normalizedValue = value.trim();

    if (!normalizedValue || values.some((item) => item.toLowerCase() === normalizedValue.toLowerCase())) {
      return;
    }

    track("settings_custom_choice_added", { value: normalizedValue });
    update([...values, normalizedValue]);
  }

  return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">Preferences</h1>
      <p className="mt-2 text-stone-600">Update the limits used for future plans and meal replacements.</p>
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
              onMouseUp={() => track("settings_preference_changed", { field: "max_time", value: prefs.maxTime })}
              onKeyUp={() => track("settings_preference_changed", { field: "max_time", value: prefs.maxTime })}
              className="mt-4 w-full accent-emerald-700 disabled:opacity-40"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-sm text-stone-500">{formatCookingLimit(prefs.maxTime)}</p>
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <input type="checkbox" checked={prefs.maxTime === null} onChange={(event) => { track("settings_preference_changed", { field: "max_time_unlimited", value: event.target.checked }); setPrefs({ ...prefs, maxTime: event.target.checked ? null : 180 }); }} />
                Unlimited
              </label>
            </div>
          </label>
          <label>
            <span className="text-sm font-semibold">Weekly budget</span>
            <div className="mt-2 flex rounded-lg border border-stone-200 px-3">
              <span className="py-3 text-stone-400">£</span>
              <Input
                type="number"
                value={prefs.budget === 0 ? "" : prefs.budget}
                onChange={(event) => setPrefs({ ...prefs, budget: event.target.value === "" ? 0 : Number(event.target.value) })}
                onBlur={() => track("settings_preference_changed", { field: "budget", value: prefs.budget })}
                className="h-auto border-0 p-3 shadow-none focus-visible:ring-0"
              />
            </div>
          </label>
          <Field label="Location (postcode)" value={prefs.postcode} onChange={(postcode) => setPrefs({ ...prefs, postcode })} onBlur={() => track("settings_preference_changed", { field: "postcode" })} placeholder="e.g. SW7 2AZ" />
          <SelectField
            label="Your university"
            value={prefs.university}
            onChange={(university) => { track("settings_preference_changed", { field: "university", value: university }); setPrefs({ ...prefs, university }); }}
            options={universities.map((university) => ({ value: university, label: university }))}
          />
        </div>
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-600">
          <p className="font-semibold text-stone-900">Location and privacy</p>
          <p className="mt-1">
            University is used for campus meal context. Postcode can be a broad area or campus postcode; it helps estimate nearby shop and fallback options.
          </p>
          <button type="button" onClick={() => track("privacy_policy_opened", { source: "settings_location" })} className="mt-2 font-semibold text-emerald-700 underline underline-offset-4">
            View privacy summary
          </button>
        </div>
        <div className="mt-6 space-y-5">
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
            title="What do you usually eat?"
            options={likes}
            selected={prefs.likes}
            onToggle={(value) => toggle(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
            onAdd={(value) => addSelection(prefs.likes, value, (next) => setPrefs({ ...prefs, likes: next }))}
            addPlaceholder="Add a meal you often eat"
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
          <p className="mt-1 text-sm text-stone-500">Calendar titles and times are used only to adapt meal effort around busy study days.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {calendarProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => { track("settings_calendar_provider_changed", { provider: provider.id }); setCalendarProvider(provider.id); }}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition",
                  calendarProvider === provider.id ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300",
                )}
              >
                {provider.name}
              </button>
            ))}
          </div>
          {calendarEvents.length > 0 && (
            <p className="mt-3 text-sm text-stone-500">{calendarEvents.length} event{calendarEvents.length === 1 ? "" : "s"} currently imported.</p>
          )}
          <div className="mt-4 space-y-3">
            {(calendarProvider === "google" || calendarProvider === "outlook") && (calendarProvider === "google" ? isGoogleConfigured() : isOutlookConfigured()) && (
              <>
                <AppButton variant="primary" onClick={connectOAuth} disabled={importing} className="w-full justify-center py-3">
                  <RotateCcw size={15} /> {importing ? "Connecting…" : `Sign in with ${calendarProvider === "google" ? "Google" : "Microsoft"}`}
                </AppButton>
                {calendarProvider === "outlook" && (
                  <p className="text-xs font-medium text-amber-700">University and organisation accounts may block sign-in — use a subscription link below instead.</p>
                )}
                <div className="flex items-center gap-3">
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
              <AppButton variant="secondary" onClick={connectSubscriptionUrl} disabled={importing || !subscriptionUrl.trim()}>
                {importing ? "Fetching…" : "Import URL"}
              </AppButton>
            </div>
            <p className="text-xs text-stone-400">{icsSubscriptionHints[calendarProvider]}</p>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-stone-200" />
              <span className="text-xs font-medium text-stone-400">or upload a file</span>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
            <AppButton variant="secondary" onClick={() => fileRef.current?.click()} className="w-full justify-center py-3">
              <Import size={15} /> Upload .ics file
            </AppButton>
          </div>
          <Input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={handleICSImport} />
          {importMessage && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{importMessage}</p>}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AppButton variant="secondary" onClick={() => setScreen("dashboard")}>Back to dashboard</AppButton>
          <AppButton onClick={() => { track("settings_saved", { dietary_count: prefs.dietary.length, allergen_count: prefs.allergens.length, likes_count: prefs.likes.length, dislikes_count: prefs.dislikes.length }); setScreen("dashboard"); }}>Save preferences</AppButton>
        </div>
      </Card>
    </div>
  );
}
