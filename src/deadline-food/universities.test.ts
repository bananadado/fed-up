import { describe, expect, test } from "bun:test";

import { getUniversitySuggestions, OTHER_UNIVERSITY } from "./universities";

describe("UK university suggestions", () => {
  test("defaults to the ranked top five UK universities in alphabetical order", () => {
    expect(getUniversitySuggestions("")).toEqual([
      "Imperial College London",
      "University College London",
      "University of Cambridge",
      "University of Edinburgh",
      "University of Oxford",
    ]);
  });

  test("matches university names by closest typed prefix", () => {
    expect(getUniversitySuggestions("manch")).toContain("University of Manchester");
    expect(getUniversitySuggestions("bristl")[0]).toBe("University of Bristol");
  });

  test("matches common initials and aliases", () => {
    expect(getUniversitySuggestions("ucl")[0]).toBe("University College London");
    expect(getUniversitySuggestions("lse")[0]).toBe("London School of Economics and Political Science");
  });

  test("falls back to Other University when nothing is close", () => {
    expect(getUniversitySuggestions("zzzzzz")).toEqual([OTHER_UNIVERSITY]);
  });
});
