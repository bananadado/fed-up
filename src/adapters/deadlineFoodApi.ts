import type { DeadlineBootstrap, MealOption, PlanningConstraints } from "@/domain/types";

declare const __APP_NODE_ENV__: string | undefined;
declare const __BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_PROJECT_ID__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION__: string | undefined;

const DEFAULT_FIREBASE_PROJECT_ID = "drp03-50059";
const DEFAULT_FIREBASE_FUNCTIONS_REGION = "europe-west2";

export type DeadlineEndpoint = "bootstrap" | "meals" | "scenario" | "session";

const firebaseFunctionNames: Record<DeadlineEndpoint, string> = {
  bootstrap: "deadlineFoodBootstrap",
  meals: "deadlineFoodMeals",
  scenario: "deadlineFoodScenario",
  session: "deadlineFoodSession",
};

const localApiPaths: Record<DeadlineEndpoint, string> = {
  bootstrap: "/api/deadline-food/bootstrap",
  meals: "/api/deadline-food/meals",
  scenario: "/api/deadline-food/scenario",
  session: "/api/deadline-food/session",
};

function readRuntimeEnv(key: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }

  return process.env[key];
}

function readPublicEnv(definedValue: string | undefined, key: string): string | undefined {
  if (definedValue) {
    return definedValue;
  }

  return readRuntimeEnv(key);
}

function readBrowserOverride(key: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = new URLSearchParams(window.location.search).get(key) ?? window.localStorage.getItem(key);

  if (value) {
    window.localStorage.setItem(key, value);
  }

  return value ?? undefined;
}

function shouldUseFirebaseBackend(): boolean {
  const backend =
    readBrowserOverride("deadlineFoodApiBackend") ??
    readPublicEnv(
      typeof __BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND__ === "undefined"
        ? undefined
        : __BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND__,
      "BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND",
    );

  if (backend === "local") return false;
  if (backend === "firebase") return true;

  const nodeEnv = readPublicEnv(
    typeof __APP_NODE_ENV__ === "undefined" ? undefined : __APP_NODE_ENV__,
    "NODE_ENV",
  );

  return nodeEnv === "production";
}

function firebaseFunctionsBaseUrl(): string {
  const explicitBaseUrl =
    readBrowserOverride("firebaseFunctionsBaseUrl") ??
    readPublicEnv(
      typeof __BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL__ === "undefined"
        ? undefined
        : __BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL__,
      "BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL",
    );

  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, "");

  const projectId =
    readPublicEnv(
      typeof __BUN_PUBLIC_FIREBASE_PROJECT_ID__ === "undefined" ? undefined : __BUN_PUBLIC_FIREBASE_PROJECT_ID__,
      "BUN_PUBLIC_FIREBASE_PROJECT_ID",
    ) ?? DEFAULT_FIREBASE_PROJECT_ID;
  const region =
    readPublicEnv(
      typeof __BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION__ === "undefined"
        ? undefined
        : __BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION__,
      "BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION",
    ) ?? DEFAULT_FIREBASE_FUNCTIONS_REGION;

  return `https://${region}-${projectId}.cloudfunctions.net`;
}

export function deadlineFoodEndpointUrl(endpoint: DeadlineEndpoint): string {
  if (!shouldUseFirebaseBackend()) {
    return localApiPaths[endpoint];
  }

  return `${firebaseFunctionsBaseUrl()}/${firebaseFunctionNames[endpoint]}`;
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(`${label} request returned ${contentType || "an unknown content type"} instead of JSON`);
  }

  return response.json() as Promise<T>;
}

export async function fetchDeadlineBootstrap(): Promise<DeadlineBootstrap> {
  const response = await fetch(deadlineFoodEndpointUrl("bootstrap"));

  return readJson<DeadlineBootstrap>(response, "Bootstrap");
}

export async function fetchSeededMeals(): Promise<MealOption[]> {
  const response = await fetch(deadlineFoodEndpointUrl("meals"));

  return readJson<MealOption[]>(response, "Meal catalogue");
}

export async function fetchCanonicalScenario(): Promise<PlanningConstraints> {
  const response = await fetch(deadlineFoodEndpointUrl("scenario"));

  return readJson<PlanningConstraints>(response, "Scenario");
}
