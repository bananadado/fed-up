import { describe, expect, test } from "bun:test";

import { isRecipeOwnedBy, isVerified, keyIngredients, sourceUrl } from "./utils";
import type { Meal } from "./types";

describe("keyIngredients", () => {
  const serving = (name: string) => ({ name, quantity: 1, unit: "serving" as const });

  test("promotes ingredients matching words in the dish name", () => {
    const ingredients = [
      serving("soy sauce"),
      serving("black pepper"),
      serving("chicken"),
      serving("rice"),
    ];
    expect(keyIngredients("Chicken Rice Bowl", ingredients, 2)).toBe("chicken, rice");
  });

  test("falls back to original order when no ingredient matches the name", () => {
    const ingredients = [serving("noodles"), serving("soy sauce"), serving("sesame oil")];
    expect(keyIngredients("Spicy Stir Fry", ingredients, 2)).toBe("noodles, soy sauce");
  });

  test("stopwords in the dish name are not treated as ingredient matches", () => {
    // "with" and "and" are stopwords — ingredients named "with" or "and" would
    // otherwise falsely score a match
    const ingredients = [serving("garlic"), serving("onion"), serving("tomato"), serving("pasta")];
    // title words (non-stop): ["pasta", "tomato", "sauce"] → tomato and pasta score 1, others score 0
    expect(keyIngredients("Pasta with Tomato Sauce", ingredients, 2)).toBe("tomato, pasta");
  });

  test("partial word matches work (e.g. 'lemon' matches 'lemon juice')", () => {
    const ingredients = [serving("olive oil"), serving("lemon juice"), serving("garlic")];
    expect(keyIngredients("Lemon Garlic Pasta", ingredients, 2)).toBe("lemon juice, garlic");
  });

  test("respects the limit", () => {
    const ingredients = [serving("a"), serving("b"), serving("c"), serving("d"), serving("e")];
    expect(keyIngredients("A B Dish", ingredients, 3)).toBe("a, b, c");
  });
});

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

describe("isVerified", () => {
  const meal = (overrides: Partial<Meal>): Meal => ({ id: "x", isUserCreated: false, ...overrides } as Meal);

  test("explicit verified flag wins", () => {
    expect(isVerified(meal({ verified: true }))).toBe(true);
    expect(isVerified(meal({ verified: false, isUserCreated: false }))).toBe(false);
  });

  test("seed data without a flag is verified unless user-created", () => {
    expect(isVerified(meal({ isUserCreated: false }))).toBe(true);
    expect(isVerified(meal({ isUserCreated: true }))).toBe(false);
  });

  test("a user-created recipe is never verified by the implicit rule", () => {
    expect(isVerified(meal({ isUserCreated: true, verified: undefined }))).toBe(false);
  });
});

describe("isRecipeOwnedBy", () => {
  const meal = (overrides: Partial<Meal>): Meal => ({ id: "x", ...overrides } as Meal);

  test("locally-created recipes are owned regardless of account", () => {
    expect(isRecipeOwnedBy(meal({ isUserCreated: true }), null)).toBe(true);
    expect(isRecipeOwnedBy(meal({ isUserCreated: true }), "uid-1")).toBe(true);
  });

  test("a shared recipe is owned only when ownerUid matches the account", () => {
    expect(isRecipeOwnedBy(meal({ ownerUid: "uid-1" }), "uid-1")).toBe(true);
    expect(isRecipeOwnedBy(meal({ ownerUid: "uid-1" }), "uid-2")).toBe(false);
    expect(isRecipeOwnedBy(meal({ ownerUid: "uid-1" }), null)).toBe(false);
  });

  test("seed/community recipes with no owner are not owned", () => {
    expect(isRecipeOwnedBy(meal({}), "uid-1")).toBe(false);
    expect(isRecipeOwnedBy(undefined, "uid-1")).toBe(false);
  });
});
