import { firebaseFunctionUrl } from "@/adapters/deadlineFoodApi";

export function calendarFetchIcsUrl(): string {
  return firebaseFunctionUrl("calendarFetchIcs", "/api/calendar/fetch-ics");
}

export function calendarGoogleExchangeUrl(): string {
  return firebaseFunctionUrl("calendarGoogleExchange", "/api/calendar/google-exchange");
}

export function calendarOutlookExchangeUrl(): string {
  return firebaseFunctionUrl("calendarOutlookExchange", "/api/calendar/outlook-exchange");
}
