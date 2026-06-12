import { describe, expect, test } from "bun:test";

import { parseMeasureToIngredient } from "./ingredientMeasurements";

describe("parseMeasureToIngredient", () => {
  test("parses bare fractions without dropping the quantity or unit (#251 follow-up)", () => {
    // Regression: "1/2 cup" used to match only the leading "1", swallowing the
    // "/2" and the unit, yielding { quantity: 1, unit: "item" }.
    const half = parseMeasureToIngredient("water", "1/2 cup");
    expect(half.quantity).toBeCloseTo(0.5, 5);
    expect(half.unit).toBe("cup");

    const quarter = parseMeasureToIngredient("salt", "1/4 tsp");
    expect(quarter.quantity).toBeCloseTo(0.25, 5);
    expect(quarter.unit).toBe("tsp");

    const threeQuarter = parseMeasureToIngredient("flour", "3/4 cup");
    expect(threeQuarter.quantity).toBeCloseTo(0.75, 5);
    expect(threeQuarter.unit).toBe("cup");
  });

  test("parses mixed numbers", () => {
    const result = parseMeasureToIngredient("flour", "1 1/2 cups");
    expect(result.quantity).toBeCloseTo(1.5, 5);
    expect(result.unit).toBe("cup");
  });

  test("parses decimals and integers", () => {
    expect(parseMeasureToIngredient("water", "1.5 cup")).toMatchObject({ quantity: 1.5, unit: "cup" });
    expect(parseMeasureToIngredient("water", "2 cups")).toMatchObject({ quantity: 2, unit: "cup" });
    expect(parseMeasureToIngredient("water", "240ml")).toMatchObject({ quantity: 240, unit: "ml" });
  });

  test("parses Unicode vulgar fractions and keeps the unit (#251 follow-up)", () => {
    // TheMealDB writes amounts like "1 ½ tbsp" / "½ cup"; the fraction and unit
    // were both being dropped, yielding { quantity: 1, unit: "item" }.
    expect(parseMeasureToIngredient("vinegar", "1 ½ tbsp")).toMatchObject({ quantity: 1.5, unit: "tbsp" });
    expect(parseMeasureToIngredient("water", "½ cup")).toMatchObject({ quantity: 0.5, unit: "cup" });
    expect(parseMeasureToIngredient("salt", "¼ tsp")).toMatchObject({ quantity: 0.25, unit: "tsp" });

    const stuck = parseMeasureToIngredient("flour", "1½ cups");
    expect(stuck.quantity).toBeCloseTo(1.5, 5);
    expect(stuck.unit).toBe("cup");

    const mixed = parseMeasureToIngredient("butter", "2 ¾ lb");
    expect(mixed.quantity).toBeCloseTo(2.75, 5);
    expect(mixed.unit).toBe("lb");
  });

  test("falls back to item for a bare fraction with no unit", () => {
    const result = parseMeasureToIngredient("egg", "1/2");
    expect(result.quantity).toBeCloseTo(0.5, 5);
    expect(result.unit).toBe("item");
  });

  test("extracts a standalone preparation word as a count, not a unit (#251 follow-up)", () => {
    // "3 chopped" means 3 (whole) scallions, chopped — not a unit of "chopped".
    const result = parseMeasureToIngredient("scallions", "3 chopped");
    expect(result.quantity).toBe(3);
    expect(result.unit).toBe("item");
    expect(result.preparation).toBe("chopped");
  });

  test("splits trailing preparation words from a real unit", () => {
    const clove = parseMeasureToIngredient("garlic", "1 clove peeled crushed");
    expect(clove).toMatchObject({ quantity: 1, unit: "clove", preparation: "peeled crushed" });

    const tbsp = parseMeasureToIngredient("parsley", "2 tbsp finely chopped");
    expect(tbsp).toMatchObject({ quantity: 2, unit: "tbsp", preparation: "finely chopped" });
  });

  test("leaves measures without preparation words untouched", () => {
    expect(parseMeasureToIngredient("flour", "2 cups").preparation).toBeUndefined();
    expect(parseMeasureToIngredient("onion", "1 medium")).toMatchObject({ unit: "medium" });
  });
});
