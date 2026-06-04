"""Deterministic prompt construction for each animation spec.

Every prompt = action motion phrase + object noun + a fixed STYLE suffix, so the
whole set shares one consistent art style. Edit STYLE / NEGATIVE / the motion
phrases here to restyle the entire library in one place, then regenerate.

Tuned for a polished 3D/CGI cooking look from a text-to-video model.
"""

from __future__ import annotations

from .manifest import OBJECT_NOUNS

# Shared style — keep identical across every clip for a coherent set.
STYLE = (
    "polished 3D animated cooking scene, Pixar-style stylized CGI render, "
    "cinematic soft studio lighting, shallow depth of field, vibrant appetising "
    "colors, high detail, glossy surfaces, centered single subject, clean modern "
    "kitchen background, smooth fluid motion, 4k, high quality"
)

NEGATIVE = (
    "text, words, letters, captions, subtitles, watermark, logo, signature, "
    "blurry, low quality, low resolution, jpeg artifacts, distorted, deformed, "
    "flickering, glitch, warping, melting, extra limbs, people, human, hands, "
    "fingers, ugly, grainy, oversaturated, cluttered"
)

# Motion phrase per action. "{food}" is filled with the object noun (or a generic
# noun for action-level clips). Phrase so the action is the clear focus.
ACTION_MOTION: dict[str, str] = {
    "boil": "{food} gently cooking in a pot of bubbling boiling water, bubbles rising and steam swirling",
    "fry": "{food} sizzling and being tossed in a hot frying pan, oil shimmering and steam rising",
    "chop": "a kitchen knife rhythmically chopping {food} into pieces on a wooden cutting board",
    "pour": "{food} being poured smoothly from above into a bowl",
    "mix": "{food} being stirred and folded together in a bowl with a spoon moving in circles",
    "bake": "{food} baking inside an oven, golden and glowing with warm heat and rising steam",
    "season": "salt and herbs being sprinkled over {food}, seasoning falling in slow motion",
    "drain": "{food} being drained in a colander, water streaming away as steam rises",
    "microwave": "{food} heating inside a microwave, the plate slowly rotating with a warm glow",
    "assemble": "{food} being layered and assembled together piece by piece",
    "serve": "{food} plated and served on a dish, gentle steam rising",
    "generic": "{food} being cooked in a pan, gentle motion with rising steam",
}

# Generic noun for action-level clips (no specific food).
GENERIC_FOOD = "a tasty dish"


def build_prompt(action: str, object_key: str | None) -> str:
    food = OBJECT_NOUNS.get(object_key, GENERIC_FOOD) if object_key else GENERIC_FOOD
    motion = ACTION_MOTION.get(action, ACTION_MOTION["generic"]).format(food=food)
    return f"{motion}, {STYLE}"
