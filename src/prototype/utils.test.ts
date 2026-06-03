import { describe, expect, test } from "bun:test";

import { sourceUrl } from "./utils";

describe("sourceUrl", () => {
  test("returns the URL for http(s) sources", () => {
    expect(sourceUrl("https://www.bbcgoodfood.com/recipes/pasta")).toBe(
      "https://www.bbcgoodfood.com/recipes/pasta"
    );
    expect(sourceUrl("http://example.com")).toBe("http://example.com/");
  });

  test("trims surrounding whitespace before parsing", () => {
    expect(sourceUrl("  https://example.com/recipe  ")).toBe("https://example.com/recipe");
  });

  test("returns null for plain text sources", () => {
    expect(sourceUrl("Budget Bytes")).toBeNull();
    expect(sourceUrl("From your prep")).toBeNull();
    expect(sourceUrl("OpenFoodFacts")).toBeNull();
  });

  test("returns null for non-http(s) protocols", () => {
    expect(sourceUrl("javascript:alert(1)")).toBeNull();
    expect(sourceUrl("ftp://example.com/file")).toBeNull();
    expect(sourceUrl("mailto:hello@example.com")).toBeNull();
  });

  test("returns null for empty or missing sources", () => {
    expect(sourceUrl("")).toBeNull();
    expect(sourceUrl("   ")).toBeNull();
    expect(sourceUrl(undefined)).toBeNull();
    expect(sourceUrl(null)).toBeNull();
  });
});
