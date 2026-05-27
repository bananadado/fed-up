import posthogJs, { type PostHog } from "posthog-js";

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

const personalDataProperties = [
  "email",
  "name",
  "postcode",
  "postal_code",
  "address",
  "phone",
  "sessionId",
  "anonymous_session_id",
];

if (token) {
  posthogJs.init(token, {
    api_host: host || "https://app.posthog.com",
    defaults: "2026-01-30",
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: {
      dom_event_allowlist: ["click", "change", "submit"],
      element_allowlist: ["a", "button", "form", "input", "select", "textarea", "label"],
      capture_copied_text: false,
      element_attribute_ignorelist: ["value", "placeholder", "data-value"],
    },
    rageclick: {
      click_count: 3,
      threshold_px: 30,
      timeout_ms: 1000,
      content_ignorelist: true,
    },
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_heatmaps: true,
    capture_performance: {
      network_timing: true,
      web_vitals: true,
    },
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
      blockSelector: "[data-ph-block]",
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: request => ({
        ...request,
        requestHeaders: undefined,
        requestBody: undefined,
        responseHeaders: undefined,
        responseBody: undefined,
      }),
    },
    mask_personal_data_properties: true,
    custom_personal_data_properties: personalDataProperties,
    property_denylist: ["postcode", "sessionId"],
  });

  posthogJs.startSessionRecording(true);
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
