import type { CalendarEvent } from "./types";

declare const __BUN_PUBLIC_GOOGLE_CLIENT_ID__: string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const clientId: string =
  (typeof __BUN_PUBLIC_GOOGLE_CLIENT_ID__ !== "undefined" ? __BUN_PUBLIC_GOOGLE_CLIENT_ID__ : undefined) ??
  (typeof process !== "undefined" ? process.env.BUN_PUBLIC_GOOGLE_CLIENT_ID : undefined) ??
  "";

const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const API_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

let scriptLoaded = false;

function loadGIS(): Promise<void> {
  if (scriptLoaded || window.google?.accounts?.oauth2) {
    scriptLoaded = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

function requestToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
        } else if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error("No access token received"));
        }
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? error.type));
      },
    });
    client.requestAccessToken();
  });
}

type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurrence?: string[];
  status?: string;
};

async function fetchEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now);
  until.setMonth(until.getMonth() + 3);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    maxResults: "250",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar API returned ${response.status}`);
  }

  const data = (await response.json()) as { items?: GoogleEvent[] };
  const importedAt = new Date().toISOString();

  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id ?? `google-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: e.summary ?? "Untitled event",
      description: e.description ?? "",
      location: e.location ?? "",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      allDay: !e.start?.dateTime,
      recurrence: e.recurrence?.join(";") ?? "",
      source: "google" as const,
      importedAt,
    }));
}

export function isGoogleConfigured(): boolean {
  return clientId.length > 0;
}

export async function importGoogleCalendar(): Promise<CalendarEvent[]> {
  if (!clientId) {
    throw new Error("Google Calendar not configured. Add BUN_PUBLIC_GOOGLE_CLIENT_ID to your .env file.");
  }

  await loadGIS();
  const token = await requestToken(clientId);
  return fetchEvents(token);
}
