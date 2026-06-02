TECHNIQUE_WEIGHTS: dict[str, float] = {
    "stir fry": 0.3,
    "reduce sauce": 0.3,
    "deep fry": 0.6,
    "bake": 0.2,
    "roast": 0.2,
    "grill": 0.3,
    "poach": 0.3,
    "steam": 0.1,
    "blanch": 0.2,
    "sauté": 0.25,
    "boil": 0.05,
    "microwave": 0.0,
    "chop": 0.1,
    "dice": 0.15,
    "julienne": 0.4,
    "debone": 0.5,
    "marinate": 0.1,
    "knead": 0.35,
    "fold": 0.15,
    "whisk": 0.1,
    "simmer": 0.1,
    "caramelize": 0.35,
    "temper": 0.5,
}

UNCOMMON_EQUIPMENT = {"wok", "blender", "food processor", "thermometer", "mandoline", "pressure cooker", "stand mixer"}


def score_difficulty(recipe: dict) -> float:
    score = 0.0

    techniques = recipe.get("techniques", [])
    for t in techniques:
        score += TECHNIQUE_WEIGHTS.get(t.lower(), 0.2)

    ingredients = recipe.get("ingredients", [])
    n = len(ingredients) if isinstance(ingredients, list) else 0
    score += min(n / 15.0, 0.4)

    prep = recipe.get("prep_minutes", 0)
    score += min(prep / 60.0, 0.3)

    steps = recipe.get("instructions", recipe.get("steps", []))
    if len(steps) > 5:
        score += 0.15

    equipment = recipe.get("equipment", [])
    uncommon_count = sum(1 for e in equipment if e.lower() in UNCOMMON_EQUIPMENT)
    score += uncommon_count * 0.15

    meal_type = recipe.get("meal_type", recipe.get("type", ""))
    type_adjustments = {"fallback": -0.3, "remix": -0.15, "quick_cook": -0.1, "prep_base": 0.1}
    score += type_adjustments.get(meal_type, 0.0)

    return max(0.0, min(1.0, score))
