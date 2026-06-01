import { useState } from "react";
import { CalendarPlus, Pencil, Trash2, X, Minus, Plus } from "lucide-react";
import type { Deadline, Screen } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { Input } from "@/components/ui/input";
import { days } from "../data";
import { cn } from "@/lib/utils";
import { clockTimeInputPattern } from "@/lib/timeInput";
import { cookingEffortReason, workloadLabel } from "../workloadModel";
import type { TrackPrototypeEvent } from "../analytics";

const urgencyLevels: Deadline["urgency"][] = ["low", "medium", "high"];
const urgencyLabel: Record<Deadline["urgency"], string> = { low: "Low", medium: "Medium", high: "High" };

type WorkloadDraft = {
  day: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkloadDraft | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const selectedDeadline = deadlines.find((d) => d.id === selectedId) ?? null;

  function updateDeadline(id: string, patch: Partial<Deadline>) {
    setDeadlines(deadlines.map((d) => (d.id === id ? { ...d, ...patch, confirmed: true } : d)));
    track("calendar_workload_updated", { deadline_id: id, fields: Object.keys(patch) });
  }

  function deleteDeadline(id: string) {
    setDeadlines(deadlines.filter((d) => d.id !== id));
    setSelectedId(null);
    track("calendar_workload_deleted", { deadline_id: id });
  }

  function startManualWorkload(day: string) {
    setSelectedId(null);
    setFormErrors({});
    setDraft({ day, title: "", time: "", urgency: null, effortHours: 1 });
    track("calendar_manual_workload_started", { day });
  }

  function saveManualWorkload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    const errors: FormErrors = {};
    if (!draft.title.trim()) {
      errors.title = "Title is required.";
    }
    if (!draft.time.trim()) {
      errors.time = "Time is required.";
    } else if (!clockTimeInputPattern.test(draft.time.trim())) {
      errors.time = "Choose a valid time.";
    }
    if (!draft.urgency) {
      errors.urgency = "Select an urgency level.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const nextDeadline: Deadline = {
      id: `manual-${Date.now()}`,
      title: draft.title.trim(),
      date: draft.day,
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
      day: nextDeadline.date,
      urgency: nextDeadline.urgency,
      effort_hours: nextDeadline.effortHours,
    });
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-4">
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

      <div className="grid gap-4 md:grid-cols-5">
        {days.map((day) => {
          const dayDeadlines = deadlines
            .filter((entry) => entry.date === day || entry.date.includes(day.split(" ")[0] ?? ""))
            .sort((a, b) => a.time.localeCompare(b.time));
          const isDraftDay = draft?.day === day;

          return (
            <div key={day} className={cn("min-h-52 rounded-lg border p-4 transition", dayDeadlines.length > 0 ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white")}>
              <p className="text-sm font-semibold">{day}</p>
              <div className="mt-3 space-y-2">
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
                        "relative w-full rounded-lg bg-white p-3 text-left shadow-sm ring-2 transition hover:shadow-md",
                        isSelected ? "ring-amber-400" : "ring-transparent hover:ring-amber-200",
                      )}
                    >
                      {isSelected && (
                        <span className="absolute right-2 top-2 rounded p-0.5 text-stone-400 hover:text-stone-600">
                          <X size={14} />
                        </span>
                      )}
                      <Badge tone={deadline.eventType === "academic" ? "amber" : "neutral"}>{workloadLabel(deadline)}</Badge>
                      <p className="mt-2 text-sm font-semibold">{deadline.title}</p>
                      <p className="mt-1 text-xs text-stone-500">{deadline.time}</p>
                      {!isSelected && (
                        <p className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-700">
                          <Pencil size={11} />
                          Edit details
                        </p>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => startManualWorkload(day)}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed transition",
                    dayDeadlines.length === 0 ? "min-h-32 flex-col p-4 text-sm" : "p-2 text-xs",
                    isDraftDay
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-stone-300 text-stone-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
                  )}
                >
                  <CalendarPlus size={dayDeadlines.length === 0 ? 22 : 14} />
                  {dayDeadlines.length === 0 ? (
                    <>
                      <span className="font-semibold">Add workload</span>
                      <span className="text-xs">Deadline, exam or heavy study block</span>
                    </>
                  ) : (
                    <span className="font-medium">Add another</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {draft && (
        <form onSubmit={saveManualWorkload} noValidate className="mt-4 rounded-xl border border-emerald-200 bg-white p-6 shadow-md">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">New academic workload</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">{draft.day}</h2>
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

      <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">Why Mixed Mode was chosen</p>
        <p className="mt-2 text-sm text-emerald-800">
          You have clustered academic tasks and late-campus days, but enough time for one short prep session. Your plan places purchased fallbacks on the busiest study days.
        </p>
      </div>
    </div>
  );
}
