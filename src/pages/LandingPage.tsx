import { CalendarDays, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";

import fedUpLogo from "@/assets/fed-up-logo.svg";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeadlineMode } from "@/state/DeadlineModeProvider";

export function LandingPage() {
  const { commands } = useDeadlineMode();

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <section className="space-y-8">
        <div className="space-y-5">
          <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <img src={fedUpLogo} alt="Fed Up" className="h-6 w-auto" />
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-slate-950 md:text-6xl">
              Healthy, affordable meals that still work when your week does not.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Build a low-effort deadline-week plan, then switch to a realistic fallback when cooking stops being
              feasible.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" onClick={commands.startDeadlineMode}>
            <Link to="/deadline-mode/setup">Activate Deadline Mode</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/fallbacks">Browse prototype fallbacks</Link>
          </Button>
        </div>
      </section>

      <Card className="rounded-lg border-slate-200 bg-white shadow-lg">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <CalendarDays className="size-5 text-emerald-700" />
            Simulated calendar prompt
          </div>
          <CardTitle className="text-2xl">Three deadline-heavy days detected next week.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3 text-sm text-slate-700">
            {["Monday report due", "Wednesday group demo", "Thursday late library session"].map(item => (
              <div key={item} className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-3">
                <CheckCircle2 className="size-4 text-emerald-700" />
                {item}
              </div>
            ))}
          </div>
          <p className="text-sm leading-6 text-slate-600">
            The prototype starts with Steven's seeded deadline week and lets you adjust budget, kitchen access, late
            campus days and dietary needs.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
