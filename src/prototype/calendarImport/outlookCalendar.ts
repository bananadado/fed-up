import type { CalendarEvent } from "./types";
import { calendarOutlookExchangeUrl } from "./calendarApi";

declare const __BUN_PUBLIC_MICROSOFT_CLIENT_ID__: string | undefined;

let _envMicrosoftClientId: string | undefined;
try { _envMicrosoftClientId = process.env.BUN_PUBLIC_MICROSOFT_CLIENT_ID; } catch { /* bundled browser */ }

const clientId: string =
  (typeof __BUN_PUBLIC_MICROSOFT_CLIENT_ID__ !== "undefined" ? __BUN_PUBLIC_MICROSOFT_CLIENT_ID__ : undefined) ??
  _envMicrosoftClientId ??
  "";

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const SCOPE = "Calendars.Read offline_access";

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

export type OutlookExchangeResult = {
  events: CalendarEvent[];
  refreshToken?: string;
  expiresAt?: string;
};

async function exchangeCodeOnServer(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  sessionId: string,
): Promise<OutlookExchangeResult> {
  const response = await fetch(calendarOutlookExchangeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri, codeVerifier, sessionId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Outlook Calendar exchange failed (${response.status})`);
  }

  return response.json() as Promise<OutlookExchangeResult>;
}

export function isOutlookConfigured(): boolean {
  return clientId.length > 0;
}

export async function importOutlookCalendar(sessionId: string): Promise<OutlookExchangeResult> {
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
  return exchangeCodeOnServer(code, redirectUri, verifier, sessionId);
}
