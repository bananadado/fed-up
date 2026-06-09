import { describe, expect, test } from "bun:test";

import { classifyImportedEvent, workloadLabel } from "./workloadModel";
import type { Deadline } from "./types";

describe("classifyImportedEvent", () => {
  test("treats timetable and study titles as academic workload", () => {
    expect(classifyImportedEvent("COMP lecture")).toBe("academic");
    expect(classifyImportedEvent("Monday lab block")).toBe("academic");
    expect(classifyImportedEvent("Project supervision")).toBe("academic");
    expect(classifyImportedEvent("Module workshop")).toBe("academic");
  });

  test("leaves non-study events as general", () => {
    expect(classifyImportedEvent("Dinner with friends")).toBe("general");
  });
});

describe("workloadLabel", () => {
  test("labels higher-effort study entries as busy academic days", () => {
    const deadline: Deadline = {
      id: "manual",
      title: "Full lab day",
      date: "Mon 8 Jun",
      time: "09:00",
      intensity: "High",
      eventType: "academic",
      effortHours: 7,
      urgency: "high",
      rawDate: "2026-06-08",
    };

    expect(workloadLabel(deadline)).toBe("Busy academic day");
  });
});
