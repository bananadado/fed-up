import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

# The heavy ML stack (torch / sentence-transformers) is imported lazily inside
# get_model() so this module can be imported in environments without a GPU or
# the ML dependencies installed (e.g. the test suite, which mocks embeddings).
_model: "SentenceTransformer | None" = None

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
DEVICE = os.environ.get("DEVICE", "cuda")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "64"))
EMBEDDING_DIM = 384  # bge-small-en-v1.5 output dimensionality


def get_model() -> "SentenceTransformer":
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(MODEL_NAME, device=DEVICE)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_model()
    embeddings = model.encode(texts, batch_size=BATCH_SIZE, normalize_embeddings=True)
    return embeddings.tolist()


def embed_single(text: str) -> list[float]:
    return embed_texts([text])[0]


def time_descriptor(prep_minutes: int) -> str:
    """Qualitative bucket for prep time.

    Synthesized natural-language descriptions cluster far better than raw
    numbers, so we map minutes onto words the embedding model understands.
    """
    if prep_minutes <= 0:
        return "No-cook"
    if prep_minutes <= 10:
        return "Very quick"
    if prep_minutes <= 20:
        return "Quick weeknight"
    if prep_minutes <= 40:
        return "Moderate effort"
    if prep_minutes <= 75:
        return "Involved"
    return "Cooking project"


def synthesize_recipe_text(recipe: dict) -> str:
    """Build the natural-language description that gets embedded.

    Deliberately emphasises the signals that matter for taste/skill clustering
    (time, ingredients, techniques, cuisine, flavour) and ignores exact
    measurements and calorie counts, per the recommendation design.
    """
    parts = [recipe.get("name", "")]

    if recipe.get("cuisine"):
        parts.append(f"Cuisine: {recipe['cuisine']}.")

    if recipe.get("flavor_profile"):
        parts.append("Flavors: " + ", ".join(recipe["flavor_profile"]) + ".")

    if recipe.get("techniques"):
        parts.append("Techniques: " + ", ".join(recipe["techniques"]) + ".")

    if recipe.get("equipment"):
        parts.append("Equipment: " + ", ".join(recipe["equipment"]) + ".")

    ingredients = recipe.get("ingredients", [])
    if ingredients:
        names = [i["name"] if isinstance(i, dict) else str(i) for i in ingredients]
        names = [n for n in names if n]
        if names:
            parts.append("Ingredients: " + ", ".join(names) + ".")

    if recipe.get("dietary_tags"):
        parts.append("Diet: " + ", ".join(recipe["dietary_tags"]) + ".")

    if recipe.get("suitability_tags"):
        parts.append(" ".join(recipe["suitability_tags"]) + ".")

    meal_type = recipe.get("meal_type", "")
    if meal_type:
        type_map = {
            "cook": "Home-cooked meal",
            "prep_base": "Batch prep base for the week",
            "remix": "Quick remix from leftovers",
            "quick_cook": "Fast one-pan cook",
            "fallback": "Ready-to-eat purchased meal",
        }
        parts.append(type_map.get(meal_type, meal_type) + ".")

    prep = recipe.get("prep_minutes", 0) or 0
    if prep:
        parts.append(f"{time_descriptor(prep)}, {prep} minutes prep.")

    slots = recipe.get("meal_slots", [])
    if slots:
        parts.append("Suitable for: " + ", ".join(slots) + ".")

    if recipe.get("note"):
        parts.append(recipe["note"])

    return " ".join(p for p in parts if p).strip()
