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

  test("canonicalises plural and variant unit strings before converting", () => {
    const cups = normalizeIngredientUnit({ name: "flour", quantity: 1, unit: "cups" }, "metric");
    expect(cups.unit).toBe("ml");

    const tbsp = normalizeIngredientUnit({ name: "flour", quantity: 4, unit: "tablespoons" }, "metric");
    expect(tbsp.unit).toBe("ml");

    const typo = normalizeIngredientUnit({ name: "flour", quantity: 2, unit: "tablespoonss" }, "metric");
    expect(typo.unit).toBe("ml");
  });

  test("converts lbs to kg in metric mode", () => {
    const result = normalizeIngredientUnit({ name: "potatoes", quantity: 3, unit: "lbs" }, "metric");
    expect(result.unit).toBe("kg");
    expect(result.quantity).toBeCloseTo(1.36, 1);
  });

  test("cleans name-embedded quantity+unit when original unit is serving", () => {
    const result = normalizeIngredientUnit(
      { name: "1 1/2 cups All purpose flour", quantity: 1, unit: "serving" },
      "metric",
    );
    expect(result.unit).toBe("ml");
    expect(result.quantity).toBeCloseTo(354.9, 0);
    expect(result.name).toBe("all purpose flour");
  });

  test("cleans name-embedded quantity+unit even when original already has a real unit", () => {
    const result = normalizeIngredientUnit(
      { name: "1 1/2 cups All purpose flour", quantity: 1.5, unit: "cup" },
      "metric",
    );
    expect(result.unit).toBe("ml");
    expect(result.quantity).toBeCloseTo(354.9, 0);
    expect(result.name).toBe("all purpose flour");
  });

  test("leaves plain serving ingredients unchanged", () => {
    const item = { name: "egg", quantity: 2, unit: "serving" };
    expect(normalizeIngredientUnit(item, "metric")).toEqual(item);
  });

  test("keeps cup/tsp/tbsp as-is in imperial mode", () => {
    const cup = normalizeIngredientUnit({ name: "flour", quantity: 1.5, unit: "cup" }, "imperial");
    expect(cup.unit).toBe("cup");
    expect(cup.quantity).toBe(1.5);

    const tsp = normalizeIngredientUnit({ name: "salt", quantity: 1, unit: "tsp" }, "imperial");
    expect(tsp.unit).toBe("tsp");

    const tbsp = normalizeIngredientUnit({ name: "oil", quantity: 2, unit: "tbsp" }, "imperial");
    expect(tbsp.unit).toBe("tbsp");
  });

  test("splits compound unit into base unit and preparation", () => {
    const result = normalizeIngredientUnit(
      { name: "garlic", quantity: 3, unit: "cloves crushed" },
      "metric",
    );
    expect(result.unit).toBe("clove");
    expect(result.preparation).toBe("crushed");
    expect(result.quantity).toBe(3);
  });

  test("does not split fl oz (oz is not a preparation word)", () => {
    const result = normalizeIngredientUnit({ name: "milk", quantity: 1, unit: "fl oz" }, "metric");
    expect(result.unit).toBe("ml");
    expect(result.quantity).toBeCloseTo(29.6, 0);
  });

  test("canonicalises cloves to clove on passthrough", () => {
    const result = normalizeIngredientUnit({ name: "garlic", quantity: 2, unit: "cloves" }, "metric");
    expect(result.unit).toBe("clove");
  });

  test("keeps oz/lb as-is in imperial mode", () => {
    const oz = normalizeIngredientUnit({ name: "cheese", quantity: 4, unit: "oz" }, "imperial");
    expect(oz.unit).toBe("oz");
    expect(oz.quantity).toBe(4);
  });

  test("normalises size-descriptor units (medium, large, small, whole) to serving", () => {
    expect(normalizeIngredientUnit({ name: "onion", quantity: 2, unit: "medium" }, "metric").unit).toBe("serving");
    expect(normalizeIngredientUnit({ name: "onion", quantity: 1, unit: "large" }, "metric").unit).toBe("serving");
    expect(normalizeIngredientUnit({ name: "apple", quantity: 3, unit: "small" }, "metric").unit).toBe("serving");
    expect(normalizeIngredientUnit({ name: "garlic", quantity: 1, unit: "whole" }, "metric").unit).toBe("serving");
  });

  test("redirects prep-word units to preparation field and normalises unit to serving", () => {
    const sliced = normalizeIngredientUnit({ name: "onion", quantity: 2, unit: "sliced" }, "metric");
    expect(sliced.unit).toBe("serving");
    expect(sliced.preparation).toBe("sliced");

    const chopped = normalizeIngredientUnit({ name: "onion", quantity: 3, unit: "chopped" }, "metric");
    expect(chopped.unit).toBe("serving");
    expect(chopped.preparation).toBe("chopped");
  });

  test("redirects significant prep-word units so they flow through to shopping key", () => {
    const frozen = normalizeIngredientUnit({ name: "peas", quantity: 1, unit: "frozen" }, "metric");
    expect(frozen.unit).toBe("serving");
    expect(frozen.preparation).toBe("frozen");
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
