import { deadlineFoodEndpointUrl } from "@/adapters/deadlineFoodApi";

import {
  ANONYMOUS_SESSION_STORAGE_KEY,
  createAnonymousSessionId,
  isAnonymousSessionId,
  PROTOTYPE_SESSION_RETENTION_DAYS,
  type PrototypeSessionSettings,
} from "./sessionPersistence";
import { getDeadlineFoodAuthToken } from "./accountAuth";

type AnonymousSessionResponse = {
  sessionId: string;
  settings: PrototypeSessionSettings | null;
  retentionDays?: number;
  expiresAt?: string | null;
};

function readStoredSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(ANONYMOUS_SESSION_STORAGE_KEY);

  if (isAnonymousSessionId(stored)) {
    return stored;
  }

  if (stored !== null) {
    window.localStorage.removeItem(ANONYMOUS_SESSION_STORAGE_KEY);
  }

  return null;
}

function storeSessionId(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ANONYMOUS_SESSION_STORAGE_KEY, sessionId);
}

// Drops the locally stored session handle so the next load starts from a brand
// new anonymous session (used after deleting an account, which must not reuse
// the deleted account's session handle).
export function clearStoredAnonymousSessionId(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ANONYMOUS_SESSION_STORAGE_KEY);
}

export function getOrCreateAnonymousSessionId(): string {
  const existingSessionId = readStoredSessionId();

  if (existingSessionId !== null) {
    return existingSessionId;
  }

  const sessionId = createAnonymousSessionId();
  storeSessionId(sessionId);
  return sessionId;
}

async function readJson(response: Response, label: string): Promise<AnonymousSessionResponse> {
  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}`);
  }

  return response.json() as Promise<AnonymousSessionResponse>;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getDeadlineFoodAuthToken().catch(() => null);
  return token ? {authorization: `Bearer ${token}`} : {};
}

export async function loadAnonymousSessionSettings(sessionId: string): Promise<AnonymousSessionResponse> {
  const url = new URL(deadlineFoodEndpointUrl("session"), window.location.origin);
  url.searchParams.set("sessionId", sessionId);

  const body = await readJson(
    await fetch(url, {
      headers: await authHeaders(),
    }),
    "Anonymous session load",
  );

  if (isAnonymousSessionId(body.sessionId)) {
    storeSessionId(body.sessionId);
  }

  return {
    ...body,
    retentionDays: body.retentionDays ?? PROTOTYPE_SESSION_RETENTION_DAYS,
  };
}

// Permanently deletes the signed-in account's synced profile and its Firebase
// Auth user (the backend does both, keyed by the verified token's uid). Requires
// a non-anonymous auth token; throws if the request is rejected.
export async function deleteAccountProfile(): Promise<void> {
  const headers = await authHeaders();
  if (!headers.authorization) {
    throw new Error("You need to be signed in to delete your account.");
  }

  const response = await fetch(deadlineFoodEndpointUrl("session"), {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Account deletion request failed with ${response.status}`);
  }
}

export async function saveAnonymousSessionSettings(
  sessionId: string,
  settings: PrototypeSessionSettings,
): Promise<AnonymousSessionResponse> {
  const body = await readJson(
    await fetch(deadlineFoodEndpointUrl("session"), {
      method: "PUT",
      headers: {
        ...(await authHeaders()),
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId, settings }),
    }),
    "Anonymous session save",
  );

  if (isAnonymousSessionId(body.sessionId)) {
    storeSessionId(body.sessionId);
  }

  return {
    ...body,
    retentionDays: body.retentionDays ?? PROTOTYPE_SESSION_RETENTION_DAYS,
  };
}
