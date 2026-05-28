import { describe, expect, test } from "bun:test";
import type { PostHogConfig } from "posthog-js";
import { createPostHogConfig } from "./posthogConfig";

describe("createPostHogConfig", () => {
  test("enables session replay and starts recording after the SDK loads", () => {
    const startSessionRecordingCalls: unknown[] = [];
    const config = createPostHogConfig("");

    type LoadedPostHog = Parameters<NonNullable<Partial<PostHogConfig>["loaded"]>>[0];

    const client = {
      startSessionRecording: (override: unknown) => {
        startSessionRecordingCalls.push(override);
      },
    } as LoadedPostHog;

    config.loaded?.(client);

    expect(config.api_host).toBe("https://us.i.posthog.com");
    expect(config.disable_session_recording).toBe(false);
    expect(config.session_recording?.maskAllInputs).toBe(true);
    expect(startSessionRecordingCalls).toEqual([true]);
  });

  test("uses the configured PostHog host when provided", () => {
    const config = createPostHogConfig("https://eu.i.posthog.com");

    expect(config.api_host).toBe("https://eu.i.posthog.com");
  });
});
