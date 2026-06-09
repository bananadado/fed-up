import type { CalendarProvider } from "../types";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: string;
  source: CalendarProvider;
  importedAt: string;
};
