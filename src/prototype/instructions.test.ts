import { describe, expect, test } from "bun:test";

import { briefInstruction, briefInstructions, hasBriefVariant } from "./instructions";

describe("briefInstruction", () => {
  test("keeps the first sentence of a multi-sentence step", () => {
    expect(
      briefInstruction("Heat the oil in a pan. Add the onion and cook until soft. Stir occasionally."),
    ).toBe("Heat the oil in a pan.");
  });

  test("leaves a single-sentence step unchanged", () => {
    expect(briefInstruction("Boil the pasta for 10 minutes")).toBe("Boil the pasta for 10 minutes");
  });

  test("does not split on an abbreviation followed by a number", () => {
    expect(briefInstruction("Cook for approx. 5 minutes then drain")).toBe("Cook for approx. 5 minutes then drain");
  });

  test("trims surrounding whitespace", () => {
    expect(briefInstruction("  Whisk the eggs. Season well.  ")).toBe("Whisk the eggs.");
  });
});

describe("briefInstructions", () => {
  test("maps every step to its brief form", () => {
    expect(
      briefInstructions(["Chop the veg. Keep it rough.", "Simmer for 15 minutes"]),
    ).toEqual(["Chop the veg.", "Simmer for 15 minutes"]);
  });
});

describe("hasBriefVariant", () => {
  test("is true when any step would be shortened", () => {
    expect(hasBriefVariant(["Mix it all. Then rest.", "Serve hot"])).toBe(true);
  });

  test("is false when every step is already a single sentence", () => {
    expect(hasBriefVariant(["Boil the kettle", "Pour over the noodles"])).toBe(false);
  });
});
