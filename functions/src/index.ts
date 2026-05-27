import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import * as logger from "firebase-functions/logger";
import type {Request, Response} from "express";
import {randomUUID} from "crypto";
import {
  canonicalConstraints,
  deadlineBootstrap,
  prototypeMeta,
  seededMeals,
} from "./generated/prototypeData";

initializeApp();
setGlobalOptions({region: "europe-west2", maxInstances: 10});

const firestore = getFirestore();
const prototypeRef = firestore.collection("prototypeData").doc("deadlineFood");
const anonymousSessionsRef = firestore.collection("anonymousSessions");
const anonymousSessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;
const sessionRetentionDays = 90;
const sessionRetentionMs = sessionRetentionDays * 24 * 60 * 60 * 1000;
const prototypeSessionSettingsVersion = 1;

type PrototypeData = typeof deadlineBootstrap;
type HttpRequest = Request;
type HttpResponse = Response;
type UnknownRecord = Record<string, unknown>;

type PrototypeSessionSettings = {
  settingsVersion: typeof prototypeSessionSettingsVersion;
  preferences: {
    maxTime: number | null;
    budget: number;
    kitchen: string;
    postcode: string;
    university: string;
    dietary: string[];
    allergens: string[];
    dislikes: string[];
    likes: string[];
  };
  deadlines: {
    id: string;
    title: string;
    date: string;
    time: string;
    intensity: string;
  }[];
  selectedSources: string[];
  onboarded: boolean;
};

async function seedPrototypeData(): Promise<PrototypeData> {
  await prototypeRef.set(
    {
      ...deadlineBootstrap,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return deadlineBootstrap;
}

async function getPrototypeData(): Promise<PrototypeData> {
  const snapshot = await prototypeRef.get();

  if (!snapshot.exists) {
    return seedPrototypeData();
  }

  const data = snapshot.data();

  return {
    meals: Array.isArray(data?.meals) ? data.meals : seededMeals,
    canonicalConstraints:
      typeof data?.canonicalConstraints === "object" ?
        data.canonicalConstraints :
        canonicalConstraints,
    prototype:
      typeof data?.prototype === "object" ? data.prototype : prototypeMeta,
  } as PrototypeData;
}

function rejectUnsupportedMethod(request: HttpRequest, response: HttpResponse): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.set("Allow", "GET, HEAD, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

function rejectUnsupportedSessionMethod(
  request: HttpRequest,
  response: HttpResponse,
): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "PUT" &&
    request.method !== "POST"
  ) {
    response.set("Allow", "GET, HEAD, PUT, POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

function sendJson(response: HttpResponse, body: unknown): void {
  response.set("Cache-Control", "public, max-age=60, s-maxage=300");
  response.status(200).json(body);
}

function sendError(response: HttpResponse, error: unknown): void {
  logger.error("Deadline food function failed", error);
  response.status(500).json({error: "Prototype data could not be loaded"});
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function boundedString(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function boundedStringList(
  value: unknown,
  maxItems = 20,
  maxLength = 80,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeDeadline(value: unknown): PrototypeSessionSettings["deadlines"][number] | null {
  const deadline = asRecord(value);

  if (deadline === null) {
    return null;
  }

  return {
    id: boundedString(deadline.id, randomUUID(), 80),
    title: boundedString(deadline.title, "Untitled deadline"),
    date: boundedString(deadline.date, ""),
    time: boundedString(deadline.time, ""),
    intensity: boundedString(deadline.intensity, "Medium", 40),
  };
}

function normalizePrototypeSessionSettings(value: unknown): PrototypeSessionSettings {
  const settings = asRecord(value);

  if (settings === null) {
    throw new Error("Session settings must be an object.");
  }

  if (settings.settingsVersion !== prototypeSessionSettingsVersion) {
    throw new Error("Unsupported session settings version.");
  }

  const preferences = asRecord(settings.preferences);

  if (preferences === null) {
    throw new Error("Session preferences must be an object.");
  }

  return {
    settingsVersion: prototypeSessionSettingsVersion,
    preferences: {
      maxTime:
        preferences.maxTime === null ?
          null :
          boundedNumber(preferences.maxTime, 20, 1, 240),
      budget: boundedNumber(preferences.budget, 48, 0, 1000),
      kitchen: boundedString(preferences.kitchen, "full", 80),
      postcode: boundedString(preferences.postcode, "", 24),
      university: boundedString(preferences.university, "", 160),
      dietary: boundedStringList(preferences.dietary),
      allergens: boundedStringList(preferences.allergens),
      dislikes: boundedStringList(preferences.dislikes),
      likes: boundedStringList(preferences.likes),
    },
    deadlines: Array.isArray(settings.deadlines) ?
      settings.deadlines
        .map(normalizeDeadline)
        .filter((deadline): deadline is NonNullable<typeof deadline> => deadline !== null)
        .slice(0, 20) :
      [],
    selectedSources: boundedStringList(settings.selectedSources),
    onboarded: settings.onboarded === true,
  };
}

function sessionExpiryTimestamp(): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() + sessionRetentionMs));
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}

function readRequestBody(request: HttpRequest): UnknownRecord | null {
  if (typeof request.body === "string") {
    try {
      return asRecord(JSON.parse(request.body));
    } catch (_error) {
      return null;
    }
  }

  return asRecord(request.body);
}

function sendSessionJson(
  response: HttpResponse,
  sessionId: string,
  settings: PrototypeSessionSettings | null,
  expiresAt: Timestamp | string | null,
): void {
  response.status(200).json({
    sessionId,
    settings,
    retentionDays: sessionRetentionDays,
    expiresAt: typeof expiresAt === "string" ? expiresAt : timestampToIso(expiresAt),
  });
}

export const deadlineFoodBootstrap = onRequest({cors: true}, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    sendJson(response, await getPrototypeData());
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodMeals = onRequest({cors: true}, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    const data = await getPrototypeData();
    sendJson(response, data.meals);
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodScenario = onRequest({cors: true}, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    const data = await getPrototypeData();
    sendJson(response, data.canonicalConstraints);
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodSession = onRequest({cors: true}, async (request, response) => {
  if (rejectUnsupportedSessionMethod(request, response)) return;

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const requestedSessionId = request.query.sessionId;
      const sessionId = typeof requestedSessionId === "string" ? requestedSessionId : "";

      if (!anonymousSessionIdPattern.test(sessionId)) {
        response.status(400).json({error: "A valid anonymous session ID is required."});
        return;
      }

      const sessionRef = anonymousSessionsRef.doc(sessionId);
      const snapshot = await sessionRef.get();

      if (!snapshot.exists) {
        sendSessionJson(response, sessionId, null, null);
        return;
      }

      const data = snapshot.data();
      const settings = normalizePrototypeSessionSettings(data?.settings);
      const expiresAt = sessionExpiryTimestamp();

      await sessionRef.set(
        {
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt,
        },
        {merge: true},
      );

      sendSessionJson(response, sessionId, settings, expiresAt);
      return;
    }

    const body = readRequestBody(request);

    if (body === null) {
      response.status(400).json({error: "Session request body must be an object."});
      return;
    }

    const requestedSessionId = body?.sessionId;
    const sessionId =
      typeof requestedSessionId === "string" &&
      anonymousSessionIdPattern.test(requestedSessionId) ?
        requestedSessionId :
        randomUUID();
    let settings: PrototypeSessionSettings;

    try {
      settings = normalizePrototypeSessionSettings(body.settings);
    } catch (error) {
      response.status(400).json({error: error instanceof Error ? error.message : "Invalid session settings."});
      return;
    }

    const sessionRef = anonymousSessionsRef.doc(sessionId);
    const existingSession = await sessionRef.get();
    const expiresAt = sessionExpiryTimestamp();

    await sessionRef.set(
      {
        ...(existingSession.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
        schemaVersion: 1,
        settingsVersion: prototypeSessionSettingsVersion,
        settings,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt,
      },
      {merge: true},
    );

    sendSessionJson(response, sessionId, settings, expiresAt);
  } catch (error) {
    logger.error("Deadline food session function failed", error);
    response.status(500).json({error: "Anonymous session could not be saved"});
  }
});
