import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Bell, CalendarPlus, CalendarClock, ChevronDown, Download, ExternalLink, Pencil, Trash2, X, Minus, Plus, ChevronLeft, ChevronRight, ChefHat } from "lucide-react";
import type { CalendarEvent, Deadline, Meal, PlanEntry, Preferences, Screen } from "../types";
import { getPrepSuggestions, type PrepSuggestion } from "../advancePrep";
import { AppButton, Badge } from "../components/primitives";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clockTimeInputPattern } from "@/lib/timeInput";
import { cookingEffortReason, workloadLabel } from "../workloadModel";
import type { TrackEvent } from "../analytics";
import { getMealById } from "../utils";
import {
  buildCookingIcs,
  buildGoogleCalendarUrl,
  buildShoppingGoogleCalendarUrl,
  cookingIcsFilename,
  type CookingCalendarBlock,
} from "../cookingCalendar";

const urgencyLevels: Deadline["urgency"][] = ["low", "medium", "high"];
const urgencyLabel: Record<Deadline["urgency"], string> = { low: "Low", medium: "Medium", high: "High" };

type WorkloadDraft = {
  dayLabel: string;
  dayIso: string;
  title: string;
  time: string;
  urgency: Deadline["urgency"] | null;
  effortHours: number;
  eventType: "academic" | "general";
};

type FormErrors = {
  title?: string;
  time?: string;
  urgency?: string;
};

type ViewMode = "week" | "month";
type DayCell = { isoDate: string; label: string; isToday: boolean };
type MonthCell = DayCell & { dayNumber: number; isCurrentMonth: boolean };

// --- Date helpers ---

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(iso: string): Date {
  const parts = iso.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function getWeekDays(offset: number): DayCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toLocalIso(today);
  const dow = today.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + toMon + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isoDate = toLocalIso(d);
    return { isoDate, label: dayLabel(d), isToday: isoDate === todayIso };
  });
}

function getMonthGrid(offset: number): MonthCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toLocalIso(today);
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const startDow = first.getDay();
  const toMon = startDow === 0 ? -6 : 1 - startDow;
  const start = new Date(first);
  start.setDate(first.getDate() + toMon);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const endDow = last.getDay();
  const end = new Date(last);
  end.setDate(last.getDate() + (endDow === 0 ? 0 : 7 - endDow));
  const cells: MonthCell[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const isoDate = toLocalIso(cursor);
    cells.push({
      isoDate,
      label: dayLabel(cursor),
      dayNumber: cursor.getDate(),
      isToday: isoDate === todayIso,
      isCurrentMonth: cursor.getMonth() === first.getMonth(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function weekPeriodLabel(days: DayCell[]): string {
  const s = parseIso(days[0]!.isoDate);
  const e = parseIso(days[6]!.isoDate);
  const eMon = e.toLocaleDateString("en-GB", { month: "short" });
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.getDate()} ${eMon} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${s.toLocaleDateString("en-GB", { month: "short" })}–${e.getDate()} ${eMon} ${e.getFullYear()}`;
}

function monthPeriodLabel(offset: number): string {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}


// --- DeadlineEditPanel ---

function DeadlineEditPanel({ deadline, onUpdate, onDelete, onClose }: {
  deadline: Deadline;
  onUpdate: (patch: Partial<Deadline>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-white p-6 shadow-md">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">Editing event</p>
          <Input
            value={deadline.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="h-auto rounded-lg border-stone-200 bg-white p-2 text-base font-semibold text-stone-900"
          />
          <p className="mt-1 text-xs text-stone-500">{deadline.date} · {deadline.time}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Time</p>
          <Input
            type="time"
            step="60"
            value={deadline.time}
            onChange={(e) => onUpdate({ time: e.target.value })}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(), p = 12; if (e.clientX - r.left < p || r.right - e.clientX < p || e.clientY - r.top < p || r.bottom - e.clientY < p) e.currentTarget.showPicker?.(); }}
            className="h-auto cursor-pointer rounded-lg border-stone-200 bg-white p-3"
          />
          <p className="mt-1.5 text-xs text-stone-400">When this event starts.</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Event type</p>
          <div className="flex gap-2">
            {(["academic", "general"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onUpdate({ eventType: type })}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition",
                  deadline.eventType === type
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                )}
              >
                {type}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-stone-400">Academic events affect how much cooking effort Fed Up assigns.</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Estimated effort</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onUpdate({ effortHours: Math.max(0.5, deadline.effortHours - 0.5) })}
              disabled={deadline.effortHours <= 0.5}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[4rem] text-center text-lg font-semibold text-stone-900">
              {deadline.effortHours % 1 === 0 ? `${deadline.effortHours}h` : `${Math.floor(deadline.effortHours)}h 30m`}
            </span>
            <button
              type="button"
              onClick={() => onUpdate({ effortHours: Math.min(12, deadline.effortHours + 0.5) })}
              disabled={deadline.effortHours >= 12}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="mt-1.5 text-xs text-stone-400">How many hours this event needs from you.</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Urgency</p>
          <div className="flex gap-2">
            {urgencyLevels.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onUpdate({ urgency: level })}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-sm font-medium transition",
                  deadline.urgency === level
                    ? level === "high"
                      ? "border-rose-400 bg-rose-50 text-rose-800"
                      : level === "medium"
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                )}
              >
                {urgencyLabel[level]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-stone-400">How time-sensitive this event feels to you.</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm text-stone-500">{cookingEffortReason(deadline)}</p>
        <div className="flex gap-2">
          <AppButton type="button" variant="danger" onClick={onDelete} className="shrink-0">
            <Trash2 size={15} /> Delete
          </AppButton>
          <AppButton variant="primary" onClick={onClose} className="shrink-0">
            Done
          </AppButton>
        </div>
      </div>
    </div>
  );
}

// --- CookingScheduler ---

// Trigger a client-side download of the generated .ics file. Guarded for SSR /
// non-browser environments so the module stays import-safe.
function downloadIcs(filename: string, contents: string) {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatIngredient(i: { name: string; quantity: number; unit: string; preparation?: string }): string {
  const qty = Number.isInteger(i.quantity) ? String(i.quantity) : i.quantity.toFixed(1);
  const prep = i.preparation ? ` (${i.preparation})` : "";
  return `${qty} ${i.unit} ${i.name}${prep}`;
}

function CookingScheduler({
  plan,
  customRecipes,
  defaultDateIso,
  track,
}: {
  plan: PlanEntry[];
  customRecipes: Meal[];
  defaultDateIso: string;
  track: TrackEvent;
}) {
  // Distinct meals from the current plan, plus any saved custom recipes, so the
  // user schedules cooking for something they actually intend to make.
  const schedulableMeals = useMemo(() => {
    const byId = new Map<string, Meal>();
    plan.forEach((entry) => {
      entry.meals.forEach((planMeal) => {
        const meal = getMealById(planMeal.mealId, customRecipes);
        if (meal && !byId.has(meal.id)) byId.set(meal.id, meal);
      });
    });
    customRecipes.forEach((meal) => {
      if (!byId.has(meal.id)) byId.set(meal.id, meal);
    });
    return [...byId.values()].filter((meal) => meal.type !== "fallback");
  }, [plan, customRecipes]);

  const [mealId, setMealId] = useState<string>(() => schedulableMeals[0]?.id ?? "");
  const [dateIso, setDateIso] = useState(defaultDateIso);
  const [time, setTime] = useState("18:00");
  // null = no reminder; number = minutes before the cooking block
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportedMethod, setExportedMethod] = useState<"ics" | "google" | null>(null);

  const selectedMeal = schedulableMeals.find((meal) => meal.id === mealId) ?? null;

  function buildBlock(): CookingCalendarBlock | null {
    if (!selectedMeal) {
      setError("Pick a meal to schedule.");
      return null;
    }
    if (!clockTimeInputPattern.test(time.trim())) {
      setError("Choose a valid cooking time.");
      return null;
    }
    setError(null);
    return {
      mealName: selectedMeal.name,
      cookMinutes: selectedMeal.time,
      dateIso,
      time: time.trim(),
      shoppingReminder: reminderMinutes !== null,
      shoppingReminderLeadMinutes: reminderMinutes ?? undefined,
      ingredients: selectedMeal.ingredients.map(formatIngredient),
    };
  }

  function handleDownload() {
    const block = buildBlock();
    if (!block) return;
    downloadIcs(cookingIcsFilename(block), buildCookingIcs(block));
    setExportedMethod("ics");
    track("cooking_block_exported", {
      meal_id: selectedMeal!.id,
      cook_minutes: selectedMeal!.time,
      date: block.dateIso,
      shopping_reminder: reminderMinutes !== null,
      method: "ics",
    });
  }

  function handleGoogle() {
    const block = buildBlock();
    if (!block) return;
    if (typeof window !== "undefined") {
      window.open(buildGoogleCalendarUrl(block), "_blank", "noopener,noreferrer");
      if (reminderMinutes !== null) {
        window.open(buildShoppingGoogleCalendarUrl(block), "_blank", "noopener,noreferrer");
      }
    }
    setExportedMethod("google");
    track("cooking_block_exported", {
      meal_id: selectedMeal!.id,
      cook_minutes: selectedMeal!.time,
      date: block.dateIso,
      shopping_reminder: reminderMinutes !== null,
      method: "google",
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <CalendarClock size={18} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-stone-900">Schedule cooking time</h2>
          <p className="mt-1 text-sm text-stone-600">
            Block out time to cook a meal and export it to your calendar (Google, Apple or Outlook).
            No account linking needed.
          </p>
        </div>
      </div>

      {schedulableMeals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">
          Add meals to your plan or save a recipe first, then schedule cooking time here.
        </p>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_150px_140px]">
            <div>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Meal</span>
                <div className="relative mt-2">
                  <select
                    value={mealId}
                    onChange={(e) => { setMealId(e.target.value); setError(null); setExportedMethod(null); }}
                    className="h-auto w-full appearance-none rounded-lg border border-stone-200 bg-white p-3 pr-9 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  >
                    {schedulableMeals.map((meal) => (
                      <option key={meal.id} value={meal.id}>
                        {meal.name} · {meal.time} min
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
                </div>
              </label>
            </div>
            <div>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Date</span>
                <Input
                  type="date"
                  value={dateIso}
                  onChange={(e) => { setDateIso(e.target.value); setExportedMethod(null); }}
                  className="mt-2 h-auto rounded-lg border-stone-200 bg-white p-3"
                />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Start time</span>
                <Input
                  type="time"
                  step="60"
                  value={time}
                  onChange={(e) => { setTime(e.target.value); setError(null); setExportedMethod(null); }}
                  onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(), p = 12; if (e.clientX - r.left < p || r.right - e.clientX < p || e.clientY - r.top < p || r.bottom - e.clientY < p) e.currentTarget.showPicker?.(); }}
                  className="mt-2 h-auto cursor-pointer rounded-lg border-stone-200 bg-white p-3"
                />
              </label>
            </div>
          </div>

          {selectedMeal && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-stone-500">
              <ChefHat size={14} className="text-emerald-600" />
              Blocks {selectedMeal.time} min for cooking.
            </p>
          )}

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-stone-700">Shopping reminder</p>
            <div className="flex flex-wrap gap-2">
              {([
                { label: "None", minutes: null },
                { label: "4 hours before", minutes: 240 },
                { label: "1 day before", minutes: 1440 },
                { label: "2 days before", minutes: 2880 },
              ] as const).map(({ label, minutes }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setReminderMinutes(minutes); setExportedMethod(null); }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    reminderMinutes === minutes
                      ? minutes === null
                        ? "border-stone-400 bg-stone-100 text-stone-800"
                        : "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

          <div className="mt-5 flex flex-wrap gap-3">
            <AppButton variant="primary" onClick={handleDownload} className="justify-center">
              <Download size={15} /> Add to calendar (.ics)
            </AppButton>
            <AppButton variant="secondary" onClick={handleGoogle} className="justify-center">
              <ExternalLink size={15} /> Google Calendar
            </AppButton>
          </div>
          {reminderMinutes !== null && (
            <p className="mt-2 text-xs text-stone-400">
              Google Calendar will open 2 tabs — one for the cooking event, one for the shopping reminder.
            </p>
          )}

          {exportedMethod === "ics" && (
            <p className="mt-3 text-sm text-emerald-700">
              Cooking block downloaded — open the .ics file to add it to your calendar.
            </p>
          )}
          {exportedMethod === "google" && (
            <p className="mt-3 text-sm text-emerald-700">
              Google Calendar opened{reminderMinutes !== null ? " — both events ready to add" : ""}.
            </p>
          )}

          <p className="mt-4 text-xs text-stone-400">
            Adjust times in your calendar app as needed.
          </p>
        </>
      )}
    </div>
  );
}

// --- PrepReminderSuggestions ---

const PREP_TIME_OPTIONS = [
  { label: "7pm", value: "19:00" },
  { label: "8pm", value: "20:00" },
  { label: "9pm", value: "21:00" },
  { label: "10pm", value: "22:00" },
  { label: "11pm", value: "23:00" },
] as const;

function PrepReminderSuggestions({
  suggestions,
  prepReminderTime,
  track,
}: {
  suggestions: PrepSuggestion[];
  prepReminderTime: string;
  track: TrackEvent;
}) {
  const todayIso = toLocalIso(new Date());
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map((s) => [s.meal.id, s.reminderDateIso ?? todayIso])),
  );
  const [timeOverrides, setTimeOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(suggestions.map((s) => [s.meal.id, prepReminderTime])),
  );
  const [exported, setExported] = useState<Record<string, "ics" | "google">>({});

  if (suggestions.length === 0) return null;

  function buildPrepBlock(s: PrepSuggestion): CookingCalendarBlock {
    return {
      mealName: s.meal.name,
      eventTitle: `Prep: ${s.meal.name}`,
      cookMinutes: 15,
      dateIso: dateOverrides[s.meal.id] ?? todayIso,
      time: timeOverrides[s.meal.id] ?? prepReminderTime,
    };
  }

  function handleDownload(s: PrepSuggestion) {
    const block = buildPrepBlock(s);
    downloadIcs(cookingIcsFilename(block), buildCookingIcs(block));
    setExported((prev) => ({ ...prev, [s.meal.id]: "ics" }));
    track("prep_reminder_exported", { meal_id: s.meal.id, method: "ics", date: block.dateIso });
  }

  function handleGoogle(s: PrepSuggestion) {
    const block = buildPrepBlock(s);
    window.open(buildGoogleCalendarUrl(block), "_blank", "noopener,noreferrer");
    setExported((prev) => ({ ...prev, [s.meal.id]: "google" }));
    track("prep_reminder_exported", { meal_id: s.meal.id, method: "google", date: block.dateIso });
  }

  return (
    <div className="mt-6 rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Bell size={18} />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-stone-900">Prep reminders</h2>
          <p className="mt-1 text-sm text-stone-600">
            These meals need advance prep. Add a reminder to your calendar the evening before.
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {suggestions.map((s) => (
          <div key={s.meal.id} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-stone-900">{s.meal.image} {s.meal.name}</p>
                <p className="mt-0.5 text-xs text-stone-500">{s.prep.reason} · planned {s.entry.day}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-stone-600">Reminder date</span>
                <Input
                  type="date"
                  value={dateOverrides[s.meal.id] ?? todayIso}
                  onChange={(e) => setDateOverrides((prev) => ({ ...prev, [s.meal.id]: e.target.value }))}
                  className="mt-1 h-auto rounded-lg border-stone-200 bg-white p-2 text-sm"
                />
              </label>
              <div>
                <span className="text-xs font-semibold text-stone-600">Reminder time</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PREP_TIME_OPTIONS.map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTimeOverrides((prev) => ({ ...prev, [s.meal.id]: value }))}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                        (timeOverrides[s.meal.id] ?? prepReminderTime) === value
                          ? "border-blue-400 bg-blue-50 text-blue-800"
                          : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <AppButton variant="primary" onClick={() => handleDownload(s)} className="justify-center py-2 text-xs">
                  <Download size={13} /> Add (.ics)
                </AppButton>
                <AppButton variant="secondary" onClick={() => handleGoogle(s)} className="justify-center py-2 text-xs">
                  <ExternalLink size={13} /> Google Calendar
                </AppButton>
              </div>
            </div>
            {exported[s.meal.id] === "ics" && (
              <p className="mt-2 text-xs text-emerald-700">Prep reminder downloaded — open the .ics to add it.</p>
            )}
            {exported[s.meal.id] === "google" && (
              <p className="mt-2 text-xs text-emerald-700">Google Calendar opened — confirm to add the reminder.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- CalendarScreen ---

export function CalendarScreen({
  deadlines,
  setDeadlines,
  calendarEvents,
  plan,
  customRecipes,
  prefs,
  setScreen,
  track,
}: {
  deadlines: Deadline[];
  setDeadlines: (deadlines: Deadline[]) => void;
  calendarEvents: CalendarEvent[];
  plan: PlanEntry[];
  customRecipes: Meal[];
  prefs: Preferences;
  setScreen: (screen: Screen) => void;
  track: TrackEvent;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkloadDraft | null>(() => {
    try {
      const saved = sessionStorage.getItem("deadlineFood:calendarDraft");
      if (saved) return JSON.parse(saved) as WorkloadDraft;
    } catch { /* sessionStorage unavailable */ }
    return null;
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const prepSuggestions = useMemo(() => getPrepSuggestions(plan, customRecipes), [plan, customRecipes]);

  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem("deadlineFood:calendarDraft", JSON.stringify(draft));
      else sessionStorage.removeItem("deadlineFood:calendarDraft");
    } catch { /* sessionStorage unavailable */ }
  }, [draft]);

  const selectedDeadline = deadlines.find((d) => d.id === selectedId) ?? null;
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const monthGrid = useMemo(() => getMonthGrid(monthOffset), [monthOffset]);
  const periodLabel = viewMode === "week" ? weekPeriodLabel(weekDays) : monthPeriodLabel(monthOffset);
  const isAtToday = viewMode === "week" ? weekOffset === 0 : monthOffset === 0;

  function deadlinesForDay(isoDate: string, label: string) {
    return deadlines
      .filter((d) => (d.rawDate ? d.rawDate === isoDate : d.date === label))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function updateDeadline(id: string, patch: Partial<Deadline>) {
    setDeadlines(deadlines.map((d) => (d.id === id ? { ...d, ...patch, confirmed: true } : d)));
    track("calendar_workload_updated", { deadline_id: id, fields: Object.keys(patch) });
  }

  function deleteDeadline(id: string) {
    setDeadlines(deadlines.filter((d) => d.id !== id));
    setSelectedId(null);
    track("calendar_workload_deleted", { deadline_id: id });
  }

  function startManualWorkload(isoDate: string, label: string) {
    setSelectedId(null);
    setFormErrors({});
    setDraft({ dayLabel: label, dayIso: isoDate, title: "", time: "", urgency: null, effortHours: 1, eventType: "academic" });
    track("calendar_manual_workload_started", { day: isoDate });
  }

  function saveManualWorkload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    const errors: FormErrors = {};
    if (!draft.title.trim()) errors.title = "Title is required.";
    if (!draft.time.trim()) errors.time = "Time is required.";
    else if (!clockTimeInputPattern.test(draft.time.trim())) errors.time = "Choose a valid time.";
    if (!draft.urgency) errors.urgency = "Select an urgency level.";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const nextDeadline: Deadline = {
      id: `manual-${Date.now()}`,
      title: draft.title.trim(),
      date: draft.dayLabel,
      rawDate: draft.dayIso,
      time: draft.time.trim(),
      intensity: urgencyLabel[draft.urgency!],
      eventType: draft.eventType,
      effortHours: draft.effortHours,
      urgency: draft.urgency!,
      confirmed: true,
    };

    setDeadlines([...deadlines, nextDeadline]);
    setSelectedId(nextDeadline.id);
    setDraft(null);
    setFormErrors({});
    track("calendar_manual_workload_added", {
      day: nextDeadline.rawDate,
      urgency: nextDeadline.urgency,
      effort_hours: nextDeadline.effortHours,
    });
  }

  function handleViewToggle(mode: ViewMode) {
    setViewMode(mode);
    setWeekOffset(0);
    setMonthOffset(0);
  }

  function handlePrev() {
    if (viewMode === "week") setWeekOffset((o) => o - 1);
    else setMonthOffset((o) => o - 1);
  }

  function handleNext() {
    if (viewMode === "week") setWeekOffset((o) => o + 1);
    else setMonthOffset((o) => o + 1);
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Deadline calendar</h1>
          <p className="mt-2 text-stone-600">
            Tap any event to confirm its type, effort and urgency — Fed Up uses this to adjust your cooking plan.
          </p>
        </div>
        <AppButton
          variant="secondary"
          onClick={() => { track("calendar_manage_import_clicked", { deadline_count: deadlines.length }); setScreen("settings"); }}
        >
          Manage import
        </AppButton>
      </div>

      {calendarEvents.length === 0 && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18} />
            <div>
              <p className="text-sm font-semibold">No calendar has been imported.</p>
              <p className="mt-1 text-sm leading-6">
                Calendar import is optional. You can import calendar events any time through Settings or the Calendar menu.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Calendar navigation bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            aria-label="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[11rem] px-2 text-center text-sm font-semibold text-stone-800">{periodLabel}</span>
          <button
            type="button"
            onClick={handleNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            aria-label="Next"
          >
            <ChevronRight size={16} />
          </button>
          {!isAtToday && (
            <button
              type="button"
              onClick={() => { setWeekOffset(0); setMonthOffset(0); }}
              className="ml-1 rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex overflow-hidden rounded-lg border border-stone-200">
          {(["week", "month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleViewToggle(mode)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium capitalize transition",
                viewMode === mode
                  ? "bg-amber-50 text-amber-800"
                  : "bg-white text-stone-500 hover:bg-stone-50",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Week view */}
      {viewMode === "week" && (
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[800px] grid-cols-7 gap-2">
            {weekDays.map(({ isoDate, label, isToday }) => {
              const [dayName, dayNum] = label.split(" ");
              const dayDeadlines = deadlinesForDay(isoDate, label);
              const isDraftDay = draft?.dayIso === isoDate;
              return (
                <div
                  key={isoDate}
                  className={cn(
                    "rounded-xl border p-3 transition",
                    isToday
                      ? "border-amber-300 bg-amber-50"
                      : dayDeadlines.length > 0
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-stone-200 bg-white",
                  )}
                >
                  <div className="mb-3 text-center">
                    <p className="text-xs font-medium text-stone-400">{dayName}</p>
                    <p className={cn("text-xl font-bold leading-tight", isToday ? "text-amber-600" : "text-stone-800")}>
                      {dayNum}
                    </p>
                  </div>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                    {dayDeadlines.map((deadline) => {
                      const isSelected = deadline.id === selectedId;
                      return (
                        <button
                          key={deadline.id}
                          type="button"
                          onClick={() => {
                            setDraft(null);
                            setFormErrors({});
                            setSelectedId(isSelected ? null : deadline.id);
                          }}
                          className={cn(
                            "relative w-full rounded-lg bg-white p-2 text-left shadow-sm ring-2 transition hover:shadow-md",
                            isSelected ? "ring-amber-400" : "ring-transparent hover:ring-amber-200",
                          )}
                        >
                          {isSelected && (
                            <span className="absolute right-1.5 top-1.5 text-stone-400">
                              <X size={12} />
                            </span>
                          )}
                          <Badge tone={deadline.eventType === "academic" ? "amber" : "neutral"} className="text-[10px]">
                            {workloadLabel(deadline)}
                          </Badge>
                          <p className="mt-1.5 text-xs font-semibold leading-snug">{deadline.title}</p>
                          <p className="mt-0.5 text-[10px] text-stone-500">{deadline.time}</p>
                          {!isSelected && (
                            <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber-700">
                              <Pencil size={9} />
                              Edit
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => startManualWorkload(isoDate, label)}
                    className={cn(
                      "mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs transition",
                      isDraftDay
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-stone-300 text-stone-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
                    )}
                  >
                    <CalendarPlus size={12} />
                    <span className="font-medium">Add</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Month view */}
      {viewMode === "month" && (
        <div className="overflow-hidden rounded-xl border border-stone-200">
          <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-stone-500">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-stone-100">
            {monthGrid.map(({ isoDate, label, dayNumber, isToday, isCurrentMonth }) => {
              const dayDeadlines = deadlinesForDay(isoDate, label);
              const visible = dayDeadlines.slice(0, 3);
              const overflow = dayDeadlines.length - 3;
              const isDraftDay = draft?.dayIso === isoDate;
              return (
                <div
                  key={isoDate}
                  className={cn(
                    "group min-h-[90px] cursor-pointer p-1.5 transition hover:bg-amber-50/40",
                    !isCurrentMonth && "bg-stone-50/60",
                    isDraftDay && "bg-emerald-50",
                  )}
                  onClick={() => startManualWorkload(isoDate, label)}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        isToday
                          ? "bg-amber-500 text-white"
                          : isCurrentMonth
                            ? "text-stone-700"
                            : "text-stone-400",
                      )}
                    >
                      {dayNumber}
                    </span>
                    {isCurrentMonth && (
                      <span className="opacity-0 group-hover:opacity-100 transition text-stone-400">
                        <CalendarPlus size={11} />
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraft(null);
                          setFormErrors({});
                          setSelectedId(selectedId === d.id ? null : d.id);
                        }}
                        className={cn(
                          "w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium transition",
                          d.urgency === "high"
                            ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                            : d.urgency === "medium"
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                              : "bg-stone-100 text-stone-700 hover:bg-stone-200",
                          selectedId === d.id && "ring-2 ring-inset ring-amber-400",
                        )}
                      >
                        {d.title}
                      </button>
                    ))}
                    {overflow > 0 && (
                      <p className="px-1 text-[10px] text-stone-400">+{overflow} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add workload form */}
      {draft && (
        <form onSubmit={saveManualWorkload} noValidate className="mt-4 rounded-xl border border-emerald-200 bg-white p-6 shadow-md">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">New event</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">{draft.dayLabel}</h2>
              <p className="mt-1 text-sm text-stone-500">Add anything Fed Up missed so cooking effort can adapt around it.</p>
            </div>
            <button
              type="button"
              onClick={() => { setDraft(null); setFormErrors({}); }}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              aria-label="Close workload form"
            >
              <X size={16} />
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-stone-700">Title <span className="text-rose-500">*</span></p>
            <Input
              value={draft.title}
              onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setFormErrors((err) => ({ ...err, title: undefined })); }}
              placeholder="e.g. Operating Systems coursework"
              className={cn("h-auto rounded-lg border-stone-200 bg-white p-3", formErrors.title && "border-rose-400")}
            />
            {formErrors.title && <p className="mt-1 text-xs text-rose-600">{formErrors.title}</p>}
          </div>

          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-stone-700">Time <span className="text-rose-500">*</span></p>
              <Input
                type="time"
                step="60"
                value={draft.time}
                onChange={(e) => { setDraft({ ...draft, time: e.target.value }); setFormErrors((err) => ({ ...err, time: undefined })); }}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(), p = 12; if (e.clientX - r.left < p || r.right - e.clientX < p || e.clientY - r.top < p || r.bottom - e.clientY < p) e.currentTarget.showPicker?.(); }}
                className={cn("h-auto cursor-pointer rounded-lg border-stone-200 bg-white p-3", formErrors.time && "border-rose-400")}
              />
              {formErrors.time && <p className="mt-1 text-xs text-rose-600">{formErrors.time}</p>}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-stone-700">Event type</p>
              <div className="flex gap-2">
                {(["academic", "general"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraft({ ...draft, eventType: type })}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition",
                      draft.eventType === type
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-stone-400">Academic events affect cooking effort.</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-stone-700">Estimated effort</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, effortHours: Math.max(0.5, draft.effortHours - 0.5) })}
                  disabled={draft.effortHours <= 0.5}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-30"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-[4rem] text-center text-lg font-semibold text-stone-900">
                  {draft.effortHours % 1 === 0 ? `${draft.effortHours}h` : `${Math.floor(draft.effortHours)}h 30m`}
                </span>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, effortHours: Math.min(12, draft.effortHours + 0.5) })}
                  disabled={draft.effortHours >= 12}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-30"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-stone-700">Urgency <span className="text-rose-500">*</span></p>
              <div className="flex gap-2">
                {urgencyLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => { setDraft({ ...draft, urgency: level }); setFormErrors((err) => ({ ...err, urgency: undefined })); }}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-medium transition",
                      draft.urgency === level
                        ? level === "high"
                          ? "border-rose-400 bg-rose-50 text-rose-800"
                          : level === "medium"
                            ? "border-amber-400 bg-amber-50 text-amber-800"
                            : "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : formErrors.urgency
                          ? "border-rose-200 bg-white text-stone-500 hover:bg-stone-50"
                          : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
                    )}
                  >
                    {urgencyLabel[level]}
                  </button>
                ))}
              </div>
              {formErrors.urgency && <p className="mt-1 text-xs text-rose-600">{formErrors.urgency}</p>}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="secondary" onClick={() => { setDraft(null); setFormErrors({}); }} className="justify-center">
              Cancel
            </AppButton>
            <AppButton type="submit" className="justify-center">
              Save workload
            </AppButton>
          </div>
        </form>
      )}

      {selectedDeadline && (
        <DeadlineEditPanel
          deadline={selectedDeadline}
          onUpdate={(patch) => updateDeadline(selectedDeadline.id, patch)}
          onDelete={() => deleteDeadline(selectedDeadline.id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      <PrepReminderSuggestions
        suggestions={prepSuggestions}
        prepReminderTime={prefs.prepReminderTime}
        track={track}
      />

      <CookingScheduler
        plan={plan}
        customRecipes={customRecipes}
        defaultDateIso={toLocalIso(new Date())}
        track={track}
      />

    </div>
  );
}
