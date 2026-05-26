import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrototypeEvent } from "@/domain/types";
import { eventLabel } from "./format";

export function EventLog({ events }: { events: PrototypeEvent[] }) {
  const recentEvents = events.slice(-6).reverse();

  return (
    <Card className="rounded-lg border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-base">Prototype event log</CardTitle>
      </CardHeader>
      <CardContent>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-slate-600">No local events yet.</p>
        ) : (
          <ol className="space-y-2 text-sm text-slate-700">
            {recentEvents.map((event, index) => (
              <li key={`${event.occurredAt}-${index}`} className="rounded-md bg-slate-50 px-3 py-2">
                {eventLabel(event)}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
