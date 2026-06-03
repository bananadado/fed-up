"""Derive an explicit cooking-ability & preference profile for a user (issue #59).

The profile is a small, explainable vector of seven dimensions (matching the
``users`` table columns and the :class:`~app.models.UserAbility` model). It is
seeded from onboarding answers (#57) and then continuously nudged by the
recipes the user actually likes and dislikes during discovery.

Everything here is pure and deterministic so it can be unit-tested without a DB
or the embedding model.
"""

DIMENSIONS = (
    "knife_skill",
    "multi_tasking",
    "time_tolerance",
    "spice_preference",
    "adventurousness",
    "healthy_bias",
    "complexity_tolerance",
)

# Onboarding cooking-ability self-rating -> baseline skill level.
ABILITY_MAP = {"beginner": 0.25, "basic": 0.45, "intermediate": 0.65, "advanced": 0.85}

# Cuisines treated as "familiar"; anything else nudges adventurousness up.
COMMON_CUISINES = {"british", "american", "italian", "none", ""}

HEALTHY_TAGS = {"high-protein", "low-cal", "low-calorie", "healthy", "balanced", "vegan", "vegetarian", "wholegrain"}

# How strongly behavioural signal overrides onboarding priors. With K=5, a user
# needs ~5 interactions before behaviour and onboarding weigh equally.
BEHAVIOUR_HALF_LIFE = 5

# Per-action weights when aggregating liked recipes.
LIKE_WEIGHTS = {"complete": 2.0, "cook": 1.5, "save": 1.2, "swipe_right": 1.0}
DISLIKE_WEIGHTS = {"swipe_left": 1.0, "abandon": 1.5, "skip": 0.5}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def onboarding_priors(user: dict) -> dict[str, float]:
    """Baseline profile from onboarding answers only."""
    ability = ABILITY_MAP.get((user.get("cooking_ability") or "basic").lower(), 0.45)
    max_time = user.get("max_time_minutes") or 30
    likes = [t.lower() for t in (user.get("likes") or [])]
    dietary = [t.lower() for t in (user.get("dietary_tags") or [])]

    return {
        "knife_skill": ability,
        "multi_tasking": ability,
        "time_tolerance": _clamp(max_time / 90.0),
        "spice_preference": 0.7 if "spicy" in likes else 0.5,
        "adventurousness": _clamp(0.4 + 0.05 * len(likes)),
        "healthy_bias": 0.65 if any(t in HEALTHY_TAGS for t in dietary + likes) else 0.5,
        "complexity_tolerance": ability,
    }


def recipe_targets(recipe: dict) -> dict[str, float]:
    """The ability dimensions a single recipe implies."""
    difficulty = recipe.get("difficulty")
    if difficulty is None:
        difficulty = 0.5
    techniques = recipe.get("techniques") or []
    prep = recipe.get("prep_minutes") or 0
    flavors = [f.lower() for f in (recipe.get("flavor_profile") or [])]
    tags = [t.lower() for t in (recipe.get("dietary_tags") or []) + (recipe.get("suitability_tags") or [])]
    cuisine = (recipe.get("cuisine") or "").lower()

    return {
        "knife_skill": float(difficulty),
        "multi_tasking": _clamp(len(techniques) / 4.0),
        "time_tolerance": _clamp(prep / 90.0),
        "spice_preference": 0.85 if "spicy" in flavors else 0.35,
        "adventurousness": 0.7 if cuisine not in COMMON_CUISINES else 0.4,
        "healthy_bias": 0.8 if any(t in HEALTHY_TAGS for t in tags) else 0.3,
        "complexity_tolerance": float(difficulty),
    }


def _weighted_means(recipes: list[dict], weights: list[float]) -> dict[str, float] | None:
    total = sum(weights)
    if total <= 0:
        return None
    acc = {d: 0.0 for d in DIMENSIONS}
    for recipe, w in zip(recipes, weights):
        t = recipe_targets(recipe)
        for d in DIMENSIONS:
            acc[d] += t[d] * w
    return {d: acc[d] / total for d in DIMENSIONS}


def behavioural_profile(
    liked: list[dict],
    liked_weights: list[float],
    disliked: list[dict],
    disliked_weights: list[float],
) -> dict[str, float] | None:
    """Profile implied purely by likes/dislikes.

    Uses a symmetric formulation per dimension::

        value = 0.5 + (liked_mean - 0.5) - (disliked_mean - 0.5)

    so liking high-difficulty recipes raises complexity tolerance, while
    disliking spicy food lowers spice preference, and the two combine sensibly.
    """
    liked_mean = _weighted_means(liked, liked_weights)
    disliked_mean = _weighted_means(disliked, disliked_weights)
    if liked_mean is None and disliked_mean is None:
        return None

    profile = {}
    for d in DIMENSIONS:
        liked_delta = (liked_mean[d] - 0.5) if liked_mean else 0.0
        disliked_delta = (disliked_mean[d] - 0.5) if disliked_mean else 0.0
        profile[d] = _clamp(0.5 + liked_delta - disliked_delta)
    return profile


def derive_ability_profile(
    user: dict,
    liked: list[dict] | None = None,
    liked_weights: list[float] | None = None,
    disliked: list[dict] | None = None,
    disliked_weights: list[float] | None = None,
) -> dict[str, float]:
    """Blend onboarding priors with behavioural signal.

    The behavioural weight grows with the number of interactions, so a brand new
    user is described entirely by onboarding and a heavily-engaged user mostly by
    their swipes.
    """
    liked = liked or []
    disliked = disliked or []
    liked_weights = liked_weights if liked_weights is not None else [1.0] * len(liked)
    disliked_weights = disliked_weights if disliked_weights is not None else [1.0] * len(disliked)

    priors = onboarding_priors(user)
    behaviour = behavioural_profile(liked, liked_weights, disliked, disliked_weights)
    if behaviour is None:
        return {d: round(priors[d], 4) for d in DIMENSIONS}

    n = len(liked) + len(disliked)
    w = n / (n + BEHAVIOUR_HALF_LIFE)
    return {d: round(priors[d] * (1 - w) + behaviour[d] * w, 4) for d in DIMENSIONS}
