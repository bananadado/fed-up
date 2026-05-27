import { describe, expect, test } from "bun:test";

import { aggregateIngredients, buildTescoSearchUrl } from "./shopping";

describe("shopping helpers", () => {
  test("aggregates duplicate ingredients case-insensitively", () => {
    expect(aggregateIngredients(["oats", "Oats", "berries", " "])).toEqual([
      { name: "berries", count: 1 },
      { name: "oats", count: 2 },
    ]);
  });

  test("builds a Tesco search URL from shopping items", () => {
    expect(
      buildTescoSearchUrl([
        { name: "oat milk", count: 1 },
        { name: "chia seeds", count: 1 },
      ]),
    ).toBe("https://www.tesco.com/shop/en-GB/search?query=oat%20milk%20chia%20seeds");
  });
});
