import { describe, expect, test } from "bun:test";

import { normalizeIngredientUnit } from "./unitConversion";

describe("normalizeIngredientUnit", () => {
  test("converts cups and tbsp to ml in metric mode", () => {
    const cup = normalizeIngredientUnit({ name: "flour", quantity: 1, unit: "cup" }, "metric");
    expect(cup.unit).toBe("ml");
    expect(cup.quantity).toBeCloseTo(236.6, 0);

    const tbsp = normalizeIngredientUnit({ name: "flour", quantity: 4, unit: "tbsp" }, "metric");
    expect(tbsp.unit).toBe("ml");
    expect(tbsp.quantity).toBeCloseTo(59.1, 0);
  });

  test("converts g to oz in imperial mode", () => {
    const result = normalizeIngredientUnit({ name: "flour", quantity: 100, unit: "g" }, "imperial");
    expect(result.unit).toBe("oz");
    expect(result.quantity).toBeCloseTo(3.5, 0);
  });

  test("converts ml to fl oz in imperial mode (small volume)", () => {
    const result = normalizeIngredientUnit({ name: "milk", quantity: 100, unit: "ml" }, "imperial");
    expect(result.unit).toBe("fl oz");
    expect(result.quantity).toBeCloseTo(3.4, 0);
  });

  test("converts ml to cups in imperial mode (large volume)", () => {
    const result = normalizeIngredientUnit({ name: "milk", quantity: 500, unit: "ml" }, "imperial");
    expect(result.unit).toBe("cup");
    expect(result.quantity).toBeCloseTo(2.1, 0);
  });

  test("upgrades g to kg when quantity >= 1000 in metric mode", () => {
    const result = normalizeIngredientUnit({ name: "rice", quantity: 2000, unit: "g" }, "metric");
    expect(result.unit).toBe("kg");
    expect(result.quantity).toBe(2);
  });

  test("upgrades ml to l when quantity >= 1000 in metric mode", () => {
    const result = normalizeIngredientUnit({ name: "water", quantity: 1500, unit: "ml" }, "metric");
    expect(result.unit).toBe("l");
    expect(result.quantity).toBe(1.5);
  });

  test("upgrades oz to lb when quantity >= 16 in imperial mode", () => {
    const result = normalizeIngredientUnit({ name: "sugar", quantity: 1000, unit: "g" }, "imperial");
    expect(result.unit).toBe("lb");
    expect(result.quantity).toBeCloseTo(2.2, 0);
  });

  test("leaves count units unchanged in both modes", () => {
    const item = { name: "egg", quantity: 3, unit: "item" };
    expect(normalizeIngredientUnit(item, "metric")).toEqual(item);
    expect(normalizeIngredientUnit(item, "imperial")).toEqual(item);

    const slice = { name: "bread", quantity: 2, unit: "slice" };
    expect(normalizeIngredientUnit(slice, "metric")).toEqual(slice);
    expect(normalizeIngredientUnit(slice, "imperial")).toEqual(slice);
  });

  test("preserves name and preparation when converting", () => {
    const result = normalizeIngredientUnit(
      { name: "butter", quantity: 50, unit: "g", preparation: "softened" },
      "imperial",
    );
    expect(result.name).toBe("butter");
    expect(result.preparation).toBe("softened");
    expect(result.unit).toBe("oz");
  });
});
