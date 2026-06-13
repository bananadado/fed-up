import { describe, expect, test } from "bun:test";

import { initialPreferences } from "./data";
import type { PlanEntry } from "./types";
import {
  createSessionSettings,
  createPrivacyConsent,
  hasCurrentPrivacyConsent,
  isAnonymousSessionId,
  PRIVACY_CONSENT_TEXT,
  PRIVACY_POLICY_URL,
  PRIVACY_POLICY_VERSION,
  SESSION_SETTINGS_VERSION,
  normalizePreferences,
  restoreSessionPlan,
} from "./sessionPersistence";

describe("anonymous app session persistence", () => {
  test("accepts generated UUID-style anonymous session IDs", () => {
    expect(isAnonymousSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAnonymousSessionId("bad/session/id")).toBe(false);
    expect(isAnonymousSessionId("short")).toBe(false);
  });

  test("wraps user settings with the current storage schema version", () => {
    const privacyConsent = createPrivacyConsent(new Date("2026-06-09T12:00:00.000Z"));
    const settings = createSessionSettings({
      preferences: initialPreferences,
      deadlines: [],
      selectedSources: ["budget", "campus"],
      onboarded: true,
      discoverReviewedRecipeIds: ["m1", "m2"],
      privacyConsent,
    });

    expect(settings.settingsVersion).toBe(SESSION_SETTINGS_VERSION);
    expect(settings.preferences).toEqual(initialPreferences);
    expect(settings.selectedSources).toEqual(["budget", "campus"]);
    expect(settings.onboarded).toBe(true);
    expect(settings.discoverReviewedRecipeIds).toEqual(["m1", "m2"]);
    expect(settings.privacyConsent).toEqual(privacyConsent);
  });

  test("keeps a derived nearest-store vendor that still ships", () => {
    const normalized = normalizePreferences({
      ...initialPreferences,
      homeVendorId: "sainsburys",
      nearestStore: { name: "Sainsbury's Local", vendorId: "sainsburys", distanceMeters: 420 },
      geo: { latitude: 51.5, longitude: -0.17, region: "London" },
    });

    expect(normalized.homeVendorId).toBe("sainsburys");
    expect(normalized.nearestStore).toEqual({ name: "Sainsbury's Local", vendorId: "sainsburys", distanceMeters: 420 });
    expect(normalized.geo).toEqual({ latitude: 51.5, longitude: -0.17, region: "London" });
  });

  test("drops a derived vendor we no longer ship and its stale store", () => {
    const normalized = normalizePreferences({
      ...initialPreferences,
      homeVendorId: "defunct-mart",
      nearestStore: { name: "Defunct Mart", vendorId: "defunct-mart", distanceMeters: 100 },
    });

    expect(normalized.homeVendorId).toBeUndefined();
    expect(normalized.nearestStore).toBeUndefined();
  });

  test("drops a nearest store whose vendor no longer matches the home vendor", () => {
    const normalized = normalizePreferences({
      ...initialPreferences,
      homeVendorId: "tesco",
      nearestStore: { name: "Old Asda", vendorId: "asda", distanceMeters: 100 },
    });

    expect(normalized.homeVendorId).toBe("tesco");
    expect(normalized.nearestStore).toBeUndefined();
  });

  test("records current privacy consent metadata", () => {
    const consent = createPrivacyConsent(new Date("2026-06-09T12:00:00.000Z"));

    expect(consent).toEqual({
      policyVersion: PRIVACY_POLICY_VERSION,
      policyUrl: PRIVACY_POLICY_URL,
      acceptedAt: "2026-06-09T12:00:00.000Z",
      consentText: PRIVACY_CONSENT_TEXT,
    });
    expect(hasCurrentPrivacyConsent(consent)).toBe(true);
    expect(hasCurrentPrivacyConsent({ ...consent, policyVersion: "2025-01-01" })).toBe(false);
  });

  test("falls back when persisted plan data is empty or malformed", () => {
    const fallbackPlan = [
      {
        day: "Mon",
        context: "Fallback day",
        meals: [{ slot: "breakfast" as const, mealId: "m9" }],
      },
    ];

    expect(restoreSessionPlan([], fallbackPlan)).toEqual(fallbackPlan);
    expect(restoreSessionPlan([{ day: "Broken", context: "Missing meals" }], fallbackPlan)).toEqual(fallbackPlan);
  });

  test("restores structurally valid persisted plan data", () => {
    const fallbackPlan = [
      {
        day: "Mon",
        context: "Fallback day",
        meals: [{ slot: "breakfast" as const, mealId: "m9" }],
      },
    ];
    const persistedPlan: PlanEntry[] = [
      {
        day: "Tue",
        context: "Saved day",
        meals: [{ slot: "dinner", mealId: "m1", rescued: true }],
      },
    ];

    expect(restoreSessionPlan(persistedPlan, fallbackPlan)).toEqual(persistedPlan);
  });
});
