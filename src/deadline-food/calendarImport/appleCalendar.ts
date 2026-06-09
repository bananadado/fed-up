import type { CalendarEvent } from "./types";
import type { CalendarProvider } from "../types";
import { parseICSText } from "./icsParser";
import { calendarFetchIcsUrl } from "./calendarApi";

function normalizeWebcalUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("webcal://")) {
    return "https://" + trimmed.slice("webcal://".length);
  }
  return trimmed;
}

export function isSubscriptionUrl(input: string): boolean {
  const url = normalizeWebcalUrl(input);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function importFromSubscriptionUrl(
  subscriptionUrl: string,
  source: CalendarProvider = "other",
): Promise<CalendarEvent[]> {
  const url = normalizeWebcalUrl(subscriptionUrl);

  const response = await fetch(calendarFetchIcsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to fetch calendar (${response.status})`);
  }

  const icsText = await response.text();
  const events = parseICSText(icsText, source);

  if (events.length === 0) {
    throw new Error("No events found at this URL. Check that it points to a published calendar.");
  }

  return events;
}

export const icsSubscriptionHints: Record<CalendarProvider, string> = {
  google: "Google Calendar → Settings → calendar name → Integrate calendar → Secret address in iCal format.",
  outlook: "Outlook → Calendar → Settings → Shared calendars → Publish a calendar → ICS link.",
  apple: "iCloud.com → Calendar → click the share icon next to a calendar → Public Calendar → Copy Link.",
  other: "Most calendar apps let you publish or share a calendar as a URL (sometimes called webcal or iCal link). Check your app's sharing or export settings.",
};
