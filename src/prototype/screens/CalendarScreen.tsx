import { useState } from "react";
import { Pencil, X, Minus, Plus } from "lucide-react";
import type { Deadline, Screen } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { days } from "../data";
import { cn } from "@/lib/utils";
import { cookingEffortReason, workloadLabel } from "../workloadModel";
import type { TrackPrototypeEvent } from "../analytics";

const urgencyLevels: Deadline["urgency"][] = ["low", "medium", "high"];
const urgencyLabel: Record<Deadline["urgency"], string> = { low: "Low", medium: "Medium", high: "High" };

function DeadlineEditPanel({ deadline, onUpdate, onClose }: {
  deadline: Deadline;
  onUpdate: (patch: Partial<Deadline>) => void;
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

      <div className="grid gap-6 sm:grid-cols-3">
        {/* Event type */}
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
          <p className="mt-1.5 text-xs text-stone-400">
            Academic events affect how much cooking effort Autopilot assigns.
          </p>
        </div>

        {/* Estimated effort */}
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
            <span className="min-w-[3.5rem] text-center text-lg font-semibold text-stone-900">
              {deadline.effortHours}h
            </span>
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

        {/* Urgency */}
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
        <AppButton variant="primary" onClick={onClose} className="shrink-0">
          Done
        </AppButton>
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
  const selectedDeadline = deadlines.find((d) => d.id === selectedId) ?? null;

  function updateDeadline(id: string, patch: Partial<Deadline>) {
    setDeadlines(deadlines.map((deadline) => (deadline.id === id ? { ...deadline, ...patch, confirmed: true } : deadline)));
    track("calendar_workload_updated", { deadline_id: id, fields: Object.keys(patch) });
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
          const deadline = deadlines.find((entry) => entry.date === day || entry.date.includes(day.split(" ")[0] ?? ""));
          const isSelected = deadline?.id === selectedId;

          return (
            <div key={day} className={cn("min-h-52 rounded-lg border p-4 transition", deadline ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white")}>
              <p className="text-sm font-semibold">{day}</p>
              {deadline ? (
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : deadline.id)}
                  className={cn(
                    "mt-5 w-full rounded-lg bg-white p-3 text-left shadow-sm ring-2 transition hover:shadow-md",
                    isSelected ? "ring-amber-400" : "ring-transparent hover:ring-amber-200",
                  )}
                >
                  <Badge tone={deadline.eventType === "academic" ? "amber" : "neutral"}>{workloadLabel(deadline)}</Badge>
                  <p className="mt-2 text-sm font-semibold">{deadline.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{deadline.time}</p>
                  <p className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Pencil size={11} />
                    {isSelected ? "Close" : "Edit details"}
                  </p>
                </button>
              ) : (
                <p className="mt-6 text-sm text-stone-400">No academic workload detected</p>
              )}
            </div>
          );
        })}
      </div>

      {selectedDeadline && (
        <DeadlineEditPanel
          deadline={selectedDeadline}
          onUpdate={(patch) => updateDeadline(selectedDeadline.id, patch)}
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
