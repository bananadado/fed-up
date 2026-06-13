import { describe, expect, test } from "bun:test";

import { formatStoreDistance } from "./location";

describe("formatStoreDistance", () => {
  test("formats distances at or above ~0.1 mi in miles", () => {
    expect(formatStoreDistance(420)).toBe("0.3 mi");
    expect(formatStoreDistance(1609.34)).toBe("1.0 mi");
  });

  test("formats short distances in rounded metres", () => {
    expect(formatStoreDistance(120)).toBe("120 m");
    expect(formatStoreDistance(7)).toBe("10 m");
  });
});
