import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

export function calendarFetchIcsUrl(): string {
  return firebaseFunctionUrl("calendarFetchIcs", "/api/calendar/fetch-ics");
}
