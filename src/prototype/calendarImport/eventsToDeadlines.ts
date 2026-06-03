import type { CalendarEvent } from "./types";
import type { Deadline } from "../types";
import { classifyImportedEvent } from "../workloadModel";

export function isFutureEvent(event: CalendarEvent): boolean {
  if (!event.start) return true;
  const startDate = new Date(event.start);
  if (Number.isNaN(startDate.getTime())) return true;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return startDate >= todayStart;
}

export type EventDisplayFields = {
  id: string;
  title: string;
  date: string;
  time: string;
  rawDate?: string;
};

/** Display labels for a calendar event, shared by the local and backend-backed
 * deadline builders so they format dates/times identically. */
export function eventDisplayFields(event: CalendarEvent, index: number): EventDisplayFields {
  const startDate = event.start ? new Date(event.start) : null;
  const valid = startDate !== null && !Number.isNaN(startDate.getTime());

  const date = valid
    ? startDate!.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "Upcoming";

  let time = "All day";
  if (!event.allDay && valid) {
    time = startDate!.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const rawDate = valid ? startDate!.toISOString().slice(0, 10) : undefined;

  return { id: `cal-${event.source}-${index}`, title: event.title, date, time, rawDate };
}

/** Local, offline classification of calendar events into deadlines. Used as the
 * fallback when the backend deadline-context pipeline is unreachable. */
export function calendarEventsToDeadlines(events: CalendarEvent[]): Deadline[] {
  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => isFutureEvent(event))
    .map(({ event, index }) => {
      const eventType = classifyImportedEvent(event.title);
      const fields = eventDisplayFields(event, index);
      return {
        ...fields,
        intensity: eventType === "academic" ? "Medium" : "Low",
        eventType,
        effortHours: eventType === "academic" ? 3 : 0,
        urgency: eventType === "academic" ? ("medium" as const) : ("low" as const),
        confirmed: false,
      };
    });
}
