export type { CalendarEvent } from "./types";
export { parseICSText } from "./icsParser";
export { importGoogleCalendar, isGoogleConfigured, type GoogleExchangeResult } from "./googleCalendar";
export { importOutlookCalendar, isOutlookConfigured, type OutlookExchangeResult } from "./outlookCalendar";
export { importFromSubscriptionUrl, isSubscriptionUrl, icsSubscriptionHints } from "./appleCalendar";

import type { CalendarEvent } from "./types";
import type { Deadline } from "../types";
import { classifyImportedEvent } from "../workloadModel";

export function calendarEventsToDeadlines(events: CalendarEvent[]): Deadline[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return events
    .filter((event) => {
      if (!event.start) return true;
      const startDate = new Date(event.start);
      if (Number.isNaN(startDate.getTime())) return true;
      return startDate >= todayStart;
    })
    .map((event, index) => {
    const eventType = classifyImportedEvent(event.title);
    const startDate = event.start ? new Date(event.start) : null;

    const dateLabel = startDate && !Number.isNaN(startDate.getTime())
      ? startDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
      : "Upcoming";

    let timeLabel = "All day";
    if (!event.allDay && startDate && !Number.isNaN(startDate.getTime())) {
      timeLabel = startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }

    const rawDate = startDate && !Number.isNaN(startDate.getTime())
      ? startDate.toISOString().slice(0, 10)
      : undefined;

    return {
      id: `cal-${event.source}-${index}`,
      title: event.title,
      date: dateLabel,
      time: timeLabel,
      intensity: eventType === "academic" ? "Medium" : "Low",
      eventType,
      effortHours: eventType === "academic" ? 3 : 0,
      urgency: eventType === "academic" ? ("medium" as const) : ("low" as const),
      confirmed: false,
      rawDate,
    };
  });
}
