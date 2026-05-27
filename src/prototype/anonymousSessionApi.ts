import { deadlineFoodEndpointUrl } from "@/adapters/deadlineFoodApi";

import {
  ANONYMOUS_SESSION_STORAGE_KEY,
  createAnonymousSessionId,
  isAnonymousSessionId,
  PROTOTYPE_SESSION_RETENTION_DAYS,
  type PrototypeSessionSettings,
} from "./sessionPersistence";

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

export async function loadAnonymousSessionSettings(sessionId: string): Promise<AnonymousSessionResponse> {
  const url = new URL(deadlineFoodEndpointUrl("session"), window.location.origin);
  url.searchParams.set("sessionId", sessionId);

  const body = await readJson(await fetch(url), "Anonymous session load");

  if (isAnonymousSessionId(body.sessionId)) {
    storeSessionId(body.sessionId);
  }

  return {
    ...body,
    retentionDays: body.retentionDays ?? PROTOTYPE_SESSION_RETENTION_DAYS,
  };
}

export async function saveAnonymousSessionSettings(
  sessionId: string,
  settings: PrototypeSessionSettings,
): Promise<AnonymousSessionResponse> {
  const body = await readJson(
    await fetch(deadlineFoodEndpointUrl("session"), {
      method: "PUT",
      headers: {
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
