import type { PostHogConfig } from "posthog-js";

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

export function createPostHogConfig(host: string): Partial<PostHogConfig> {
  return {
    api_host: host || "https://us.i.posthog.com",
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
    loaded: client => {
      client.startSessionRecording(true);
    },
    mask_personal_data_properties: true,
    custom_personal_data_properties: personalDataProperties,
    property_denylist: ["postcode", "sessionId"],
  };
}
