import "posthog-js/dist/recorder";
import posthogJs, { type PostHog } from "posthog-js";
import { createPostHogConfig } from "./posthogConfig";

declare const __BUN_PUBLIC_POSTHOG_PROJECT_TOKEN__: string | undefined;
declare const __BUN_PUBLIC_POSTHOG_HOST__: string | undefined;

function readBunPublicEnv(definedValue: string | undefined, key: string): string {
  if (definedValue) return definedValue;
  if (typeof process !== "undefined" && process.env[key]) return process.env[key] as string;
  return "";
}

const token = readBunPublicEnv(
  typeof __BUN_PUBLIC_POSTHOG_PROJECT_TOKEN__ === "undefined" ? undefined : __BUN_PUBLIC_POSTHOG_PROJECT_TOKEN__,
  "BUN_PUBLIC_POSTHOG_PROJECT_TOKEN",
);

const host = readBunPublicEnv(
  typeof __BUN_PUBLIC_POSTHOG_HOST__ === "undefined" ? undefined : __BUN_PUBLIC_POSTHOG_HOST__,
  "BUN_PUBLIC_POSTHOG_HOST",
);

if (token) {
  posthogJs.init(token, createPostHogConfig(host));
}

type AnalyticsProperty = string | number | boolean | null | string[] | number[] | boolean[];
export type AnalyticsProperties = Record<string, AnalyticsProperty | undefined>;

function compactProperties(properties: AnalyticsProperties): Record<string, AnalyticsProperty> {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, AnalyticsProperty] => entry[1] !== undefined),
  );
}

export function registerPostHogSession(client: PostHog | undefined, sessionId: string): void {
  client?.identify(sessionId, { anonymous_session_id: sessionId });
  client?.register({ anonymous_session_id: sessionId });
}

export function registerPostHogContext(client: PostHog | undefined, properties: AnalyticsProperties): void {
  client?.register(compactProperties(properties));
}

export function capturePostHogEvent(
  client: PostHog | undefined,
  eventName: string,
  properties: AnalyticsProperties = {},
): void {
  client?.capture(eventName, compactProperties(properties));
}

export const posthog = posthogJs;
