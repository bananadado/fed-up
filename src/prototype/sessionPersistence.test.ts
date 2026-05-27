import { describe, expect, test } from "bun:test";

import { initialPreferences } from "./data";
import {
  createPrototypeSessionSettings,
  isAnonymousSessionId,
  PROTOTYPE_SESSION_SETTINGS_VERSION,
} from "./sessionPersistence";

describe("anonymous prototype session persistence", () => {
  test("accepts generated UUID-style anonymous session IDs", () => {
    expect(isAnonymousSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAnonymousSessionId("bad/session/id")).toBe(false);
    expect(isAnonymousSessionId("short")).toBe(false);
  });

  test("wraps user settings with the current storage schema version", () => {
    const settings = createPrototypeSessionSettings({
      preferences: initialPreferences,
      deadlines: [],
      selectedSources: ["budget", "campus"],
      onboarded: true,
    });

    expect(settings.settingsVersion).toBe(PROTOTYPE_SESSION_SETTINGS_VERSION);
    expect(settings.preferences).toEqual(initialPreferences);
    expect(settings.selectedSources).toEqual(["budget", "campus"]);
    expect(settings.onboarded).toBe(true);
  });
});
