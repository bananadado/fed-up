import { describe, expect, test } from "bun:test";

import {
  buildCookingIcs,
  buildGoogleCalendarUrl,
  buildShoppingGoogleCalendarUrl,
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

const blockWithIngredients: CookingCalendarBlock = {
  ...baseBlock,
  ingredients: ["200g red lentils", "1 can coconut milk"],
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

  test("includes ingredients list in description when provided", () => {
    const ics = buildCookingIcs(blockWithIngredients, NOW);
    expect(ics).toContain("- 200g red lentils");
    expect(ics).toContain("- 1 can coconut milk");
  });

  test("omits a second VEVENT when no shopping reminder is requested", () => {
    const ics = buildCookingIcs(baseBlock, NOW);
    const veventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(veventCount).toBe(1);
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  test("adds a second VEVENT for the shopping reminder instead of a VALARM", () => {
    const ics = buildCookingIcs({ ...baseBlock, shoppingReminder: true, shoppingReminderLeadMinutes: 1440 }, NOW);
    const veventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(veventCount).toBe(2);
    expect(ics).not.toContain("BEGIN:VALARM");
    expect(ics).toContain("SUMMARY:Buy ingredients: Lentil dahl");
    // 18:00 on 2026-06-10 minus 1440 min = 18:00 on 2026-06-09
    expect(ics).toContain("DTSTART:20260609T180000");
  });

  test("uses the configured lead time for the shopping event offset", () => {
    const ics = buildCookingIcs({ ...baseBlock, shoppingReminder: true, shoppingReminderLeadMinutes: 240 }, NOW);
    // 18:00 minus 240 min = 14:00
    expect(ics).toContain("DTSTART:20260610T140000");
  });

  test("description includes reminder timing label", () => {
    const ics = buildCookingIcs({ ...baseBlock, shoppingReminder: true, shoppingReminderLeadMinutes: 2880 }, NOW);
    expect(ics).toContain("Shopping reminder: buy ingredients 2 days before cooking.");
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

describe("buildShoppingGoogleCalendarUrl", () => {
  test("builds a Google Calendar URL for the shopping event offset by lead time", () => {
    const url = buildShoppingGoogleCalendarUrl({ ...baseBlock, shoppingReminderLeadMinutes: 1440 });
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Buy+ingredients%3A+Lentil+dahl");
    // 18:00 on 2026-06-10 minus 1440 min = 18:00 on 2026-06-09
    expect(url).toContain("20260609T180000");
  });

  test("includes ingredients in the shopping event description", () => {
    const url = buildShoppingGoogleCalendarUrl({ ...baseBlock, shoppingReminderLeadMinutes: 240, ingredients: ["200g lentils"] });
    expect(url).toContain("200g+lentils");
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
