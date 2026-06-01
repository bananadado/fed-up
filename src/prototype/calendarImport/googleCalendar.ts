import type { CalendarEvent } from "./types";
import { calendarGoogleExchangeUrl } from "./calendarApi";

declare const __BUN_PUBLIC_GOOGLE_CLIENT_ID__: string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            callback: (response: { code?: string; error?: string; error_description?: string }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }): { requestCode(): void };
        };
      };
    };
  }
}

let _envGoogleClientId: string | undefined;
try { _envGoogleClientId = process.env.BUN_PUBLIC_GOOGLE_CLIENT_ID; } catch { /* bundled browser */ }

const clientId: string =
  (typeof __BUN_PUBLIC_GOOGLE_CLIENT_ID__ !== "undefined" ? __BUN_PUBLIC_GOOGLE_CLIENT_ID__ : undefined) ??
  _envGoogleClientId ??
  "";

const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

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

function requestCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: SCOPE,
      ux_mode: "popup",
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
        } else if (response.code) {
          resolve(response.code);
        } else {
          reject(new Error("No authorization code received"));
        }
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? error.type));
      },
    });
    client.requestCode();
  });
}

export type GoogleExchangeResult = {
  events: CalendarEvent[];
  refreshToken?: string;
  expiresAt?: string;
};

async function exchangeCodeOnServer(code: string, sessionId: string): Promise<GoogleExchangeResult> {
  const response = await fetch(calendarGoogleExchangeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirectUri: window.location.origin,
      sessionId,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Google Calendar exchange failed (${response.status})`);
  }

  return response.json() as Promise<GoogleExchangeResult>;
}

export function isGoogleConfigured(): boolean {
  return clientId.length > 0;
}

export async function importGoogleCalendar(sessionId: string): Promise<GoogleExchangeResult> {
  if (!clientId) {
    throw new Error("Google Calendar not configured. Add BUN_PUBLIC_GOOGLE_CLIENT_ID to your .env file.");
  }

  await loadGIS();
  const code = await requestCode();
  return exchangeCodeOnServer(code, sessionId);
}
