import { describe, expect, test } from "bun:test";

import { seedMeals } from "../data";
import { classifyStep } from "./classifyStep";
import { FOOD_GLYPHS } from "./foodGlyphs";

describe("classifyStep — action detection", () => {
  test("detects the primary action across single-verb steps", () => {
    expect(classifyStep("Boil or soak the noodles according to the pack.").action).toBe("boil");
    expect(classifyStep("Fry tofu with ginger until browned.").action).toBe("fry");
    expect(classifyStep("Chop the onions finely.").action).toBe("chop");
    expect(classifyStep("Stir through lentils, pesto and spinach.").action).toBe("mix");
    expect(classifyStep("Microwave the rice and dhal packs.").action).toBe("microwave");
    expect(classifyStep("Toast the bread.").action).toBe("bake");
    expect(classifyStep("Drain and rinse the pasta.").action).toBe("drain");
  });

  test("prefers heat/specific actions over generic 'add' in multi-verb steps", () => {
    // contains add, seasoning AND roast -> the roast wins
    expect(classifyStep("Add chickpeas, oil and seasoning, then roast until tender.").action).toBe("bake");
    // contains add AND toss -> the toss (mix) wins
    expect(classifyStep("Add broccoli, soy sauce and noodles, then toss together.").action).toBe("mix");
  });

  test("scramble counts as frying, even alongside a microwave mention", () => {
    expect(classifyStep("Scramble eggs in a pan or microwave-safe bowl.").action).toBe("fry");
  });

  test("purchased / pickup steps map to serve", () => {
    expect(classifyStep("Pick up from the cafe chiller.").action).toBe("serve");
    expect(classifyStep("Order the standard bowl.").action).toBe("serve");
  });

  test("falls back to generic when no cooking verb is present", () => {
    expect(classifyStep("Check the label against your allergy settings.").action).toBe("generic");
  });
});

describe("classifyStep — object detection", () => {
  test("extracts the food from the recipe's own ingredient list", () => {
    const ingredients = [{ name: "tofu" }, { name: "noodles" }, { name: "broccoli" }];
    const result = classifyStep("Fry tofu with ginger until browned.", ingredients);
    expect(result.object).toBe("tofu");
    expect(result.objectLabel).toBe("tofu");
  });

  test("picks the earliest-mentioned ingredient and skips filler foods", () => {
    const ingredients = [{ name: "oil" }, { name: "chickpeas" }, { name: "couscous" }];
    // "oil" is filler; "chickpeas" appears before "couscous" in the sentence
    const result = classifyStep(
      "Add chickpeas, oil and seasoning, then serve with couscous.",
      ingredients,
    );
    expect(result.object).toBe("beans");
    expect(result.objectLabel).toBe("chickpeas");
  });

  test("uses a generic food glyph when an ingredient has no specific glyph", () => {
    const result = classifyStep("Warm the quinoa.", [{ name: "quinoa" }]);
    expect(result.object).toBe("food");
    expect(result.objectLabel).toBe("quinoa");
  });

  test("falls back to the food dictionary when no ingredients are passed", () => {
    expect(classifyStep("Chop the onions.").object).toBe("onion");
    expect(classifyStep("Toast the bread.").object).toBe("bread");
  });

  test("returns null object when no recognisable food is present", () => {
    expect(classifyStep("Check the label against your allergy settings.").object).toBeNull();
  });
});

describe("classifyStep — runs cleanly over all seeded recipes", () => {
  test("every step of every meal yields a known action and a valid/null object", () => {
    const validActions = new Set([
      "boil",
      "fry",
      "chop",
      "pour",
      "mix",
      "bake",
      "season",
      "drain",
      "microwave",
      "assemble",
      "serve",
      "generic",
    ]);
    for (const meal of seedMeals) {
      for (const step of meal.instructions) {
        const result = classifyStep(step, meal.ingredients);
        expect(validActions.has(result.action)).toBe(true);
        if (result.object !== null) {
          expect(FOOD_GLYPHS[result.object]).toBeDefined();
        }
      }
    }
  });
});
