"""Deterministic prompt construction for each animation spec.

Every prompt = action motion phrase + object noun + a fixed STYLE suffix, so the
whole set shares one consistent art style. Edit STYLE / NEGATIVE / the motion
phrases here to restyle the entire library in one place, then regenerate.
"""

from __future__ import annotations

from .manifest import OBJECT_NOUNS

# Shared style — keep this identical across every clip for a coherent set.
# A plain, solid background makes the alpha cut-out (rembg) clean.
STYLE = (
    "flat 2d vector illustration, thick clean black outlines, bright flat colors, "
    "simple cooking step icon, centered single subject, top-down or 3/4 view, "
    "plain solid white background, minimal, no text, smooth looping animation"
)

NEGATIVE = (
    "photo, photorealistic, 3d render, realistic, text, words, letters, watermark, "
    "logo, signature, blurry, low quality, jpeg artifacts, cluttered background, "
    "busy scene, multiple subjects, hands, fingers, people, extra objects, frame, border"
)

# Motion phrase per action. "{food}" is filled with the object noun (or a generic
# noun for action-level clips). Phrase the motion so the action is the focus.
ACTION_MOTION: dict[str, str] = {
    "boil": "{food} cooking in a pot of bubbling boiling water, rising steam",
    "fry": "{food} sizzling and being tossed in a hot frying pan, steam rising",
    "chop": "a kitchen knife rhythmically chopping {food} on a wooden cutting board, pieces falling apart",
    "pour": "{food} being poured from above into a bowl",
    "mix": "{food} being stirred and mixed in a bowl with a spoon going in circles",
    "bake": "{food} baking inside an oven, heat glow and rising steam",
    "season": "salt and herbs being sprinkled over {food}, falling seasoning",
    "drain": "{food} being drained in a colander, water streaming out",
    "microwave": "{food} heating inside a microwave, spinning plate and glow",
    "assemble": "{food} being layered and assembled together step by step",
    "serve": "{food} plated and served on a dish, gentle steam",
    "generic": "{food} being cooked, gentle motion and rising steam",
}

# Generic noun for action-level clips (no specific food).
GENERIC_FOOD = "food"


def build_prompt(action: str, object_key: str | None) -> str:
    food = OBJECT_NOUNS.get(object_key, GENERIC_FOOD) if object_key else GENERIC_FOOD
    motion = ACTION_MOTION.get(action, ACTION_MOTION["generic"]).format(food=food)
    return f"{motion}, {STYLE}"
