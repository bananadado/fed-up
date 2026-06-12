import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

import type { CalendarEvent } from "./types";
import type { Deadline } from "../types";
import { calendarEventsToDeadlines, eventDisplayFields, isFutureEvent } from "./eventsToDeadlines";

// Mirrors the recommender API's /context/deadlines response (issue #65).
export type ClassifiedEvent = {
  index: number;
  date: string | null;
  category: string;
  event_type: "academic" | "general";
  is_deadline: boolean;
  days_until: number | null;
  urgency: "low" | "medium" | "high";
  effort_hours: number;
};

export type DailyContext = {
  date: string;
  stress: number;
  available_cooking_energy: number;
  free_evening: boolean;
  meeting_hours: number;
  calendar_density: number;
  event_count: number;
  hard_deadlines: number;
  recommended_constraints: { max_prep_minutes: number; max_cleanup: number; max_complexity: number };
};

export type DeadlineContextResponse = {
  today: string;
  horizon_days: number;
  deadlines: {
    title: string;
    date: string;
    category: string;
    event_type: "academic" | "general";
    days_until: number;
    effort_hours: number;
    urgency: "low" | "medium" | "high";
  }[];
  events: ClassifiedEvent[];
  days: DailyContext[];
};

export type ContextEventInput = { title: string; start: string; end?: string | null; all_day?: boolean };

const DEFAULT_HORIZON_DAYS = 14;

function deadlineContextUrl(): string {
  return firebaseFunctionUrl("deadlineFoodDeadlineContext", "/api/recommender/deadline-context");
}

/** Low-level call to the deadline-context endpoint with already-mapped events. */
export async function requestDeadlineContext(
  events: ContextEventInput[],
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): Promise<DeadlineContextResponse> {
  const response = await fetch(deadlineContextUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events, horizon_days: horizonDays }),
  });

  if (!response.ok) {
    throw new Error(`Deadline context request failed with ${response.status}`);
  }

  return response.json() as Promise<DeadlineContextResponse>;
}

function toContextEvent(event: CalendarEvent): ContextEventInput {
  return { title: event.title, start: event.start, end: event.end || null, all_day: event.allDay };
}

/** Reconstruct a minimal context event from a deadline so the backend pipeline
 * can re-score it. Deadlines without a concrete date can't be placed. */
export function deadlineToContextEvent(deadline: Deadline): ContextEventInput | null {
  if (!deadline.rawDate) return null;
  const hasClockTime = /^\d{2}:\d{2}$/.test(deadline.time);
  return {
    title: deadline.title,
    start: hasClockTime ? `${deadline.rawDate}T${deadline.time}:00` : deadline.rawDate,
    all_day: !hasClockTime,
  };
}

export async function fetchDeadlineContext(events: CalendarEvent[]): Promise<DeadlineContextResponse> {
  return requestDeadlineContext(events.map(toContextEvent));
}

function intensityFor(event: ClassifiedEvent): string {
  if (event.event_type !== "academic") return "Low";
  return event.urgency === "high" ? "High" : "Medium";
}

/** Build the app's Deadline list from the backend classification, keeping
 * the frontend's own date/time labelling. Pure — no network. */
export function deadlinesFromContext(events: CalendarEvent[], context: DeadlineContextResponse): Deadline[] {
  const byIndex = new Map(context.events.map((event) => [event.index, event]));

  return events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => isFutureEvent(event))
    .map(({ event, index }) => {
      const classified = byIndex.get(index);
      const fields = eventDisplayFields(event, index);

      if (!classified) {
        // Index fell outside the backend response — keep a safe general default.
        return { ...fields, intensity: "Low", eventType: "general" as const, effortHours: 0, urgency: "low" as const, confirmed: false };
      }

      return {
        ...fields,
        intensity: intensityFor(classified),
        eventType: classified.event_type,
        effortHours: classified.effort_hours,
        urgency: classified.urgency,
        confirmed: false,
      };
    });
}

/** Classify imported calendar events into deadlines using the backend pipeline,
 * falling back to local heuristics if it is unavailable. */
export async function resolveDeadlinesFromEvents(events: CalendarEvent[]): Promise<Deadline[]> {
  try {
    const context = await fetchDeadlineContext(events);
    const deadlines = deadlinesFromContext(events, context);
    return deadlines.length > 0 ? deadlines : calendarEventsToDeadlines(events);
  } catch (error) {
    console.warn("Deadline context unavailable; classifying calendar events locally.", error);
    return calendarEventsToDeadlines(events);
  }
}
