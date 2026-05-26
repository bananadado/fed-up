import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import * as logger from "firebase-functions/logger";
import type {Request, Response} from "express";
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

type PrototypeData = typeof deadlineBootstrap;
type HttpRequest = Request;
type HttpResponse = Response;

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

function sendJson(response: HttpResponse, body: unknown): void {
  response.set("Cache-Control", "public, max-age=60, s-maxage=300");
  response.status(200).json(body);
}

function sendError(response: HttpResponse, error: unknown): void {
  logger.error("Deadline food function failed", error);
  response.status(500).json({error: "Prototype data could not be loaded"});
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
