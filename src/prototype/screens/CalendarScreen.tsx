import type { Deadline, Screen } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { days } from "../data";
import { cn } from "@/lib/utils";

export function CalendarScreen({ deadlines, setScreen }: { deadlines: Deadline[]; setScreen: (screen: Screen) => void }) {
  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Deadline calendar</h1>
          <p className="mt-2 text-stone-600">Autopilot uses workload intensity to reduce cooking effort.</p>
        </div>
        <AppButton variant="secondary" onClick={() => setScreen("settings")}>
          Manage import
        </AppButton>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        {days.map((day) => {
          const deadline = deadlines.find((entry) => entry.date === day || entry.date.includes(day.split(" ")[0] ?? ""));

          return (
            <div key={day} className={cn("min-h-52 rounded-lg border p-4", deadline ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-white")}>
              <p className="text-sm font-semibold">{day}</p>
              {deadline ? (
                <div className="mt-5 rounded-lg bg-white p-3 shadow-sm">
                  <Badge tone="rose">Deadline</Badge>
                  <p className="mt-2 text-sm font-semibold">{deadline.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{deadline.time}</p>
                </div>
              ) : (
                <p className="mt-6 text-sm text-stone-400">No major workload detected</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">Why Mixed Mode was chosen</p>
        <p className="mt-2 text-sm text-emerald-800">
          You have clustered deadlines and late-campus days, but enough time for one short prep session. Your plan places purchased fallbacks on the highest-pressure days.
        </p>
      </div>
    </div>
  );
}
