import { describe, expect, test } from "bun:test";

import {
  buildCookingIcs,
  buildGoogleCalendarUrl,
  cookingIcsFilename,
  escapeIcsText,
  parseLocalDateTime,
  toIcsLocalStamp,
  type CookingCalendarBlock,
} from "./cookingCalendar";

const NOW = new Date(Date.UTC(2026, 5, 3, 9, 30, 0)); // fixed for deterministic DTSTAMP

const baseBlock: CookingCalendarBlock = {
  mealName: "Lentil dahl",
  cookMinutes: 25,
  dateIso: "2026-06-10",
  time: "18:00",
};

describe("parseLocalDateTime", () => {
  test("parses a valid local date and time", () => {
    const d = parseLocalDateTime("2026-06-10", "18:00");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(10);
    expect(d!.getHours()).toBe(18);
    expect(d!.getMinutes()).toBe(0);
  });

  test("rejects malformed input", () => {
    expect(parseLocalDateTime("not-a-date", "18:00")).toBeNull();
    expect(parseLocalDateTime("2026-06-10", "25:99")).toBeNull();
    expect(parseLocalDateTime("2026-06-10", "")).toBeNull();
  });
});

describe("toIcsLocalStamp", () => {
  test("formats a floating local timestamp", () => {
    expect(toIcsLocalStamp(new Date(2026, 5, 10, 18, 0, 0))).toBe("20260610T180000");
  });
});

describe("escapeIcsText", () => {
  test("escapes commas, semicolons, backslashes and newlines", () => {
    expect(escapeIcsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });
});

describe("buildCookingIcs", () => {
  test("produces a well-formed VCALENDAR with meal name and cook time", () => {
    const ics = buildCookingIcs(baseBlock, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("\r\n"); // CRLF line endings
    expect(ics).toContain("SUMMARY:Cook: Lentil dahl");
    expect(ics).toContain("DTSTART:20260610T180000");
    expect(ics).toContain("DTEND:20260610T182500"); // 25 min later
    expect(ics).toContain("Estimated cook time: 25 min.");
    expect(ics).toContain("DTSTAMP:20260603T093000Z");
  });

  test("enforces a minimum visible block length", () => {
    const ics = buildCookingIcs({ ...baseBlock, cookMinutes: 5 }, NOW);
    expect(ics).toContain("DTEND:20260610T181500"); // bumped to 15 min
  });

  test("omits a VALARM when no shopping reminder is requested", () => {
    expect(buildCookingIcs(baseBlock, NOW)).not.toContain("BEGIN:VALARM");
  });

  test("adds a VALARM with the configured lead time for a shopping reminder", () => {
    const ics = buildCookingIcs({ ...baseBlock, shoppingReminder: true, shoppingReminderLeadMinutes: 90 }, NOW);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("ACTION:DISPLAY");
    expect(ics).toContain("TRIGGER:-PT90M");
    expect(ics).toContain("Shopping reminder: ingredients for Lentil dahl");
  });

  test("defaults the shopping reminder lead to 120 minutes", () => {
    const ics = buildCookingIcs({ ...baseBlock, shoppingReminder: true }, NOW);
    expect(ics).toContain("TRIGGER:-PT120M");
  });

  test("throws on invalid date/time", () => {
    expect(() => buildCookingIcs({ ...baseBlock, time: "nope" }, NOW)).toThrow();
  });
});

describe("buildGoogleCalendarUrl", () => {
  test("builds a Google Calendar template URL with start/end and details", () => {
    const url = buildGoogleCalendarUrl(baseBlock);
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260610T180000%2F20260610T182500");
    expect(url).toContain("text=Cook%3A+Lentil+dahl");
  });
});

describe("cookingIcsFilename", () => {
  test("slugifies the meal name and includes the date", () => {
    expect(cookingIcsFilename(baseBlock)).toBe("cook-lentil-dahl-2026-06-10.ics");
  });

  test("falls back to a default slug for empty names", () => {
    expect(cookingIcsFilename({ ...baseBlock, mealName: "!!!" })).toBe("cook-meal-2026-06-10.ics");
  });
});
