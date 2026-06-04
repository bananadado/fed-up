"""Single source of truth for which animations the pipeline generates and how they
are named.

The naming scheme is procedural and mirrors the frontend classifier
(`src/prototype/cookingAnimations/classifyStep.ts`):

    <action>_<object>      e.g. chop_onion, fry_tofu, boil_noodles   (specific)
    <action>               e.g. chop, fry, boil                       (action fallback)
    generic                                                            (ultimate fallback)

At runtime `StepAnimation` resolves a step's {action, object} against the set of
generated files in that priority order, so you can generate as many or as few
specific combos as you like — anything missing falls back gracefully.

Keep ACTIONS / OBJECTS in sync with `CookingActionType` / `FoodGlyphKey` in the
frontend. They are intentionally duplicated (not imported) so the pipeline has no
Node/TS dependency.
"""

from __future__ import annotations

from dataclasses import dataclass

# Mirror of CookingActionType (classifyStep.ts). "generic" is the catch-all.
ACTIONS: list[str] = [
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
]

# Mirror of FoodGlyphKey (foodGlyphs.ts) -> a concrete noun for the prompt.
OBJECT_NOUNS: dict[str, str] = {
    "onion": "a sliced onion",
    "garlic": "garlic cloves",
    "tomato": "ripe tomatoes",
    "pepper": "a bell pepper",
    "courgette": "a courgette (zucchini)",
    "carrot": "carrots",
    "broccoli": "broccoli florets",
    "potato": "potatoes",
    "mushroom": "mushrooms",
    "spinach": "fresh spinach leaves",
    "veg": "mixed vegetables",
    "beans": "beans and chickpeas",
    "rice": "white rice",
    "noodles": "noodles",
    "couscous": "couscous",
    "oats": "oats",
    "bread": "slices of bread",
    "egg": "eggs",
    "tofu": "cubes of tofu",
    "chicken": "chicken pieces",
    "fish": "a fish fillet",
    "cheese": "grated cheese",
    "berries": "mixed berries",
    "fruit": "fresh fruit",
    "food": "food",
}

# Curated action x object combos worth generating specifically. The frontend
# falls back to the action-level clip for any combo not listed here, so this list
# is purely "where a food-specific clip adds value". Grow it freely.
COMBOS: dict[str, list[str]] = {
    "chop": ["onion", "garlic", "tomato", "pepper", "courgette", "carrot", "broccoli", "potato", "mushroom", "veg"],
    "fry": ["onion", "egg", "tofu", "chicken", "fish", "mushroom", "veg", "rice"],
    "boil": ["noodles", "rice", "egg", "potato", "couscous", "veg"],
    "bake": ["potato", "veg", "fish", "chicken", "bread"],
    "mix": ["oats", "rice", "noodles", "veg", "beans"],
    "pour": ["rice", "noodles", "oats"],
    "season": ["veg", "chicken", "fish", "tofu"],
    "microwave": ["rice", "veg", "beans"],
    "assemble": ["bread", "veg", "beans", "cheese"],
    "serve": ["rice", "noodles", "veg", "fruit"],
    "drain": ["noodles", "rice", "beans"],
}


@dataclass(frozen=True)
class AnimSpec:
    id: str          # filename stem, e.g. "chop_onion" or "fry" or "generic"
    action: str
    object: str | None  # FoodGlyphKey or None for action-level / generic


def build_manifest() -> list[AnimSpec]:
    """Return every animation to generate: one per action + the curated combos."""
    specs: list[AnimSpec] = []
    seen: set[str] = set()

    def add(spec: AnimSpec) -> None:
        if spec.id not in seen:
            seen.add(spec.id)
            specs.append(spec)

    # Action-level fallbacks (guaranteed coverage for every action incl. generic).
    for action in ACTIONS:
        add(AnimSpec(id=action, action=action, object=None))

    # Food-specific combos.
    for action, objects in COMBOS.items():
        for obj in objects:
            if obj not in OBJECT_NOUNS:
                raise ValueError(f"Unknown object '{obj}' in COMBOS[{action}]")
            add(AnimSpec(id=f"{action}_{obj}", action=action, object=obj))

    return specs


if __name__ == "__main__":
    manifest = build_manifest()
    print(f"{len(manifest)} animations to generate:")
    for spec in manifest:
        print(f"  {spec.id}")
