import type { CalendarEvent } from "./types";

declare const __BUN_PUBLIC_MICROSOFT_CLIENT_ID__: string | undefined;

let _envMicrosoftClientId: string | undefined;
try { _envMicrosoftClientId = process.env.BUN_PUBLIC_MICROSOFT_CLIENT_ID; } catch { /* bundled browser */ }

const clientId: string =
  (typeof __BUN_PUBLIC_MICROSOFT_CLIENT_ID__ !== "undefined" ? __BUN_PUBLIC_MICROSOFT_CLIENT_ID__ : undefined) ??
  _envMicrosoftClientId ??
  "";

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_URL = "https://graph.microsoft.com/v1.0/me/calendarView";
const SCOPE = "Calendars.Read";

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64UrlEncode(array);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(hash));
  return { verifier, challenge };
}

function waitForPopupRedirect(popup: Window, origin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(interval);
          reject(new Error("Sign-in window was closed"));
          return;
        }

        if (popup.location.origin === origin) {
          const params = new URLSearchParams(popup.location.search);
          clearInterval(interval);
          popup.close();

          const error = params.get("error");
          if (error) {
            reject(new Error(params.get("error_description") ?? error));
            return;
          }

          const code = params.get("code");
          if (code) {
            resolve(code);
          } else {
            reject(new Error("No authorization code received"));
          }
        }
      } catch {
        // Cross-origin while on Microsoft's domain — keep polling
      }
    }, 200);
  });
}

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      scope: `openid ${SCOPE}`,
    }),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error_description?: string };
    throw new Error(body.error_description ?? `Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access token in response");
  return data.access_token;
}

type OutlookEvent = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
  recurrence?: unknown;
};

async function fetchEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now);
  until.setMonth(until.getMonth() + 3);

  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: until.toISOString(),
    $top: "250",
    $orderby: "start/dateTime",
    $select: "id,subject,bodyPreview,location,start,end,isAllDay,recurrence",
  });

  const response = await fetch(`${GRAPH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph API returned ${response.status}`);
  }

  const data = (await response.json()) as { value?: OutlookEvent[] };
  const importedAt = new Date().toISOString();

  return (data.value ?? []).map((e) => ({
    id: e.id ?? `outlook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: e.subject ?? "Untitled event",
    description: e.bodyPreview ?? "",
    location: e.location?.displayName ?? "",
    start: e.start?.dateTime ? new Date(e.start.dateTime + "Z").toISOString() : "",
    end: e.end?.dateTime ? new Date(e.end.dateTime + "Z").toISOString() : "",
    allDay: e.isAllDay ?? false,
    recurrence: e.recurrence ? JSON.stringify(e.recurrence) : "",
    source: "outlook" as const,
    importedAt,
  }));
}

export function isOutlookConfigured(): boolean {
  return clientId.length > 0;
}

export async function importOutlookCalendar(): Promise<CalendarEvent[]> {
  if (!clientId) {
    throw new Error("Outlook Calendar not configured. Add BUN_PUBLIC_MICROSOFT_CLIENT_ID to your .env file.");
  }

  const redirectUri = window.location.origin + "/";
  const { verifier, challenge } = await generatePKCE();

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", `openid ${SCOPE}`);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const popup = window.open(authUrl.toString(), "outlook-auth", "width=600,height=700");
  if (!popup) throw new Error("Could not open sign-in window. Please allow popups.");

  const code = await waitForPopupRedirect(popup, window.location.origin);
  const token = await exchangeCodeForToken(code, clientId, redirectUri, verifier);
  return fetchEvents(token);
}
