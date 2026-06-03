import { describe, expect, test } from "bun:test";

import { dislikes, likes } from "./data";
import { filterFoodPreferenceOptions } from "./preferenceOptions";

describe("diet-aware food preference options", () => {
  test("hides fish as a recommended avoid option for vegetarians", () => {
    expect(filterFoodPreferenceOptions(dislikes, ["Vegetarian"], "dislikes")).not.toContain("Fish");
    expect(filterFoodPreferenceOptions(likes, ["Vegetarian"], "likes")).toContain("Omelettes");
  });

  test("hides egg and fish options for vegans", () => {
    expect(filterFoodPreferenceOptions(likes, ["Vegan"], "likes")).not.toContain("Omelettes");
    expect(filterFoodPreferenceOptions(dislikes, ["Vegan"], "dislikes")).not.toContain("Fish");
  });

  test("hides gluten-heavy typical-food options for gluten-free users", () => {
    const filteredLikes = filterFoodPreferenceOptions(likes, ["Gluten-free"], "likes");

    expect(filteredLikes).not.toContain("Pasta");
    expect(filteredLikes).not.toContain("Sandwiches");
    expect(filteredLikes).not.toContain("Instant noodles");
    expect(filteredLikes).not.toContain("Wraps");
    expect(filteredLikes).not.toContain("Toast / cereal");
  });
});
