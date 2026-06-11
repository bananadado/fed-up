import { describe, expect, test } from "bun:test";

import { recipeShareToken, recipeShareUrl, shareIdForRecipe } from "./recipeShare";

describe("shareIdForRecipe", () => {
  test("is deterministic and URL-safe", () => {
    const a = shareIdForRecipe("m1");
    const b = shareIdForRecipe("m1");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-z0-9]+$/);
  });

  test("differs for different recipe ids", () => {
    expect(shareIdForRecipe("m1")).not.toBe(shareIdForRecipe("m2"));
  });

  // Pinned values keep the client cyrb53 in lockstep with the identical
  // implementation in functions/src/index.ts (#213). If these change, the
  // server hash must change with them or share links stop resolving.
  test("matches the pinned server algorithm", () => {
    expect(shareIdForRecipe("m1")).toBe("qmyn1cvxgw");
    expect(shareIdForRecipe("prep-smoky-bean-base")).toBe("1wjy7d85qzt");
    expect(shareIdForRecipe("custom-123")).toBe("34kg50q3rl");
  });
});

describe("recipeShareToken", () => {
  test("parses a recipe deep-link hash", () => {
    expect(recipeShareToken("#/recipe/qmyn1cvxgw")).toBe("qmyn1cvxgw");
  });

  test("returns null for non-recipe hashes", () => {
    expect(recipeShareToken("#/dashboard")).toBeNull();
    expect(recipeShareToken("#/recipe-detail")).toBeNull();
    expect(recipeShareToken("#/recipe/")).toBeNull();
    expect(recipeShareToken("")).toBeNull();
  });
});

describe("recipeShareUrl", () => {
  test("builds an absolute hash URL from a share id", () => {
    expect(recipeShareUrl("abc123")).toContain("/#/recipe/abc123");
  });
});
