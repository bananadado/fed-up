import { useState, useMemo } from "react";
import { CalendarPlus, Pencil, Trash2, X, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { Deadline, Screen } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clockTimeInputPattern } from "@/lib/timeInput";
import { cookingEffortReason, workloadLabel } from "../workloadModel";
import type { TrackPrototypeEvent } from "../analytics";

const urgencyLevels: Deadline["urgency"][] = ["low", "medium", "high"];
const urgencyLabel: Record<Deadline["urgency"], string> = { low: "Low", medium: "Medium", high: "High" };

type WorkloadDraft = {
  dayLabel: string;
  dayIso: string;
  title: string;
  time: string;
  urgency: Deadline["urgency"] | null;
  effortHours: number;
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
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Editing event</p>
          <p className="mt-0.5 text-base font-semibold text-stone-900">{deadline.title}</p>
          <p className="text-xs text-stone-500">{deadline.date} · {deadline.time}</p>
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
            className="h-auto rounded-lg border-stone-200 bg-white p-3"
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
          <p className="mt-1.5 text-xs text-stone-400">Academic events affect how much cooking effort Autopilot assigns.</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Estimated effort</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onUpdate({ effortHours: Math.max(1, deadline.effortHours - 1) })}
              disabled={deadline.effortHours <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[3.5rem] text-center text-lg font-semibold text-stone-900">{deadline.effortHours}h</span>
            <button
              type="button"
              onClick={() => onUpdate({ effortHours: Math.min(12, deadline.effortHours + 1) })}
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

// --- CalendarScreen ---

export function CalendarScreen({
  deadlines,
  setDeadlines,
  setScreen,
  track,
}: {
  deadlines: Deadline[];
  setDeadlines: (deadlines: Deadline[]) => void;
  setScreen: (screen: Screen) => void;
  track: TrackPrototypeEvent;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkloadDraft | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

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
    setDraft({ dayLabel: label, dayIso: isoDate, title: "", time: "", urgency: null, effortHours: 1 });
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
      eventType: "academic",
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
            Tap any event to confirm its type, effort and urgency — Autopilot uses this to adjust your cooking plan.
          </p>
        </div>
        <AppButton
          variant="secondary"
          onClick={() => { track("calendar_manage_import_clicked", { deadline_count: deadlines.length }); setScreen("settings"); }}
        >
          Manage import
        </AppButton>
      </div>

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
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">New academic workload</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">{draft.dayLabel}</h2>
              <p className="mt-1 text-sm text-stone-500">Add anything Autopilot missed so cooking effort can adapt around it.</p>
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

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Title <span className="text-rose-500">*</span></span>
                <Input
                  value={draft.title}
                  onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setFormErrors((err) => ({ ...err, title: undefined })); }}
                  placeholder="e.g. Operating Systems coursework"
                  className={cn("mt-2 h-auto rounded-lg border-stone-200 bg-white p-3", formErrors.title && "border-rose-400")}
                />
              </label>
              {formErrors.title && <p className="mt-1 text-xs text-rose-600">{formErrors.title}</p>}
            </div>
            <div>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Time <span className="text-rose-500">*</span></span>
                <Input
                  type="time"
                  step="60"
                  value={draft.time}
                  onChange={(e) => { setDraft({ ...draft, time: e.target.value }); setFormErrors((err) => ({ ...err, time: undefined })); }}
                  required
                  className={cn("mt-2 h-auto rounded-lg border-stone-200 bg-white p-3", formErrors.time && "border-rose-400")}
                />
              </label>
              {formErrors.time && <p className="mt-1 text-xs text-rose-600">{formErrors.time}</p>}
            </div>
          </div>

          <div className="mt-5 grid gap-6 sm:grid-cols-2">
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

    </div>
  );
}
