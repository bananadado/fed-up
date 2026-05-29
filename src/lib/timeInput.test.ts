import { describe, expect, test } from "bun:test";

import { minutesToTimeInputValue, timeInputValueToMinutes } from "./timeInput";

describe("time input helpers", () => {
  test("formats stored minutes for native time inputs", () => {
    expect(minutesToTimeInputValue(10)).toBe("00:10");
    expect(minutesToTimeInputValue(95)).toBe("01:35");
  });

  test("parses native time input values back into minutes", () => {
    expect(timeInputValueToMinutes("00:20")).toBe(20);
    expect(timeInputValueToMinutes("02:15")).toBe(135);
  });

  test("bounds formatted values to the configured maximum", () => {
    expect(minutesToTimeInputValue(240, 180)).toBe("03:00");
  });
});
