// Deterministic classifier that turns a single recipe instruction line into a
// procedural animation template: the cooking ACTION (knife, pan, pot, …) plus the
// OBJECT it acts on (the food glyph). No per-recipe authoring, no LLM — pure
// keyword matching so it stays explainable and works across all recipe sources.

import {
  FILLER_FOODS,
  GENERIC_FOOD_KEY,
  glyphKeyForName,
  indexOfWord,
  matchFoodInText,
  type FoodGlyphKey,
} from "./foodGlyphs";

export type CookingActionType =
  | "boil"
  | "fry"
  | "chop"
  | "pour"
  | "mix"
  | "bake"
  | "season"
  | "drain"
  | "microwave"
  | "assemble"
  | "serve"
  | "generic";

export type StepClassification = {
  action: CookingActionType;
  /** Food glyph key the animation should show, or null for apparatus only. */
  object: FoodGlyphKey | null;
  /** Human label for the object, used in the animation's aria-label. */
  objectLabel?: string;
};

/**
 * Ordered action keyword table. The FIRST group with a match wins, so more
 * specific / heat-driven actions are listed before generic ones. This matters
 * because steps contain several verbs, e.g.
 * "Add chickpeas, oil and seasoning, then roast until tender" → `bake`.
 */
export const ACTION_KEYWORDS: { action: CookingActionType; words: string[] }[] = [
  { action: "bake", words: ["roast", "bake", "oven", "grill", "traybake", "toast"] },
  { action: "fry", words: ["fry", "fried", "sear", "scramble", "sauté", "saute", "stir-fry", "stir fry", "brown"] },
  { action: "microwave", words: ["microwave", "reheat"] },
  { action: "boil", words: ["boil", "simmer", "soak", "blanch", "cook pasta", "cook the noodles", "cook"] },
  { action: "chop", words: ["chop", "slice", "dice", "cut", "mince", "grate", "peel"] },
  { action: "drain", words: ["drain", "rinse", "strain"] },
  { action: "mix", words: ["mix", "stir", "toss", "whisk", "combine", "fold", "blend", "loosen"] },
  { action: "season", words: ["season", "salt", "drizzle", "sprinkle"] },
  { action: "assemble", words: ["assemble", "fill", "wrap", "roll", "layer", "spread", "top", "pack"] },
  { action: "pour", words: ["pour", "add", "splash"] },
  { action: "serve", words: ["serve", "plate", "garnish", "enjoy", "eat", "pick up", "order", "collect", "grab"] },
];

function detectAction(text: string): CookingActionType {
  for (const { action, words } of ACTION_KEYWORDS) {
    for (const word of words) {
      if (indexOfWord(text, word) >= 0) return action;
    }
  }
  return "generic";
}

function detectObject(
  text: string,
  ingredients?: { name: string }[],
): { object: FoodGlyphKey | null; objectLabel?: string } {
  const lower = text.toLowerCase();

  // 1. Prefer a food from the recipe's own ingredient list (grounded in real
  //    data), choosing the one mentioned earliest in the step.
  if (ingredients?.length) {
    let best: { name: string; index: number } | null = null;
    for (const ingredient of ingredients) {
      const name = ingredient.name?.toLowerCase().trim();
      if (!name || FILLER_FOODS.has(name)) continue;
      const index = indexOfWord(lower, name);
      if (index >= 0 && (best === null || index < best.index)) {
        best = { name, index };
      }
    }
    if (best) {
      return { object: glyphKeyForName(best.name) ?? GENERIC_FOOD_KEY, objectLabel: best.name };
    }
  }

  // 2. Fall back to the built-in food keyword dictionary.
  const dictMatch = matchFoodInText(lower);
  if (dictMatch) {
    return { object: dictMatch.key, objectLabel: dictMatch.label };
  }

  // 3. No recognisable food — apparatus only.
  return { object: null };
}

export function classifyStep(
  instruction: string,
  ingredients?: { name: string }[],
): StepClassification {
  const text = (instruction ?? "").toLowerCase();
  return { action: detectAction(text), ...detectObject(text, ingredients) };
}
