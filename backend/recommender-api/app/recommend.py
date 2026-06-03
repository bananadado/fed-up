import json
import os
import random

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .ability import DIMENSIONS, recipe_targets

EXPLORATION_RATE = float(os.environ.get("EXPLORATION_RATE", "0.2"))
EXPLORATION_TEMPERATURE = float(os.environ.get("EXPLORATION_TEMPERATURE", "0.15"))

ABILITY_MAP = {"beginner": 0.25, "basic": 0.45, "intermediate": 0.65, "advanced": 0.85}

# Ability dimensions where only an *over-demand* should be penalised: a recipe
# asking for more skill/time than the user can give is a poor match, but a user
# who is more capable than a recipe requires is perfectly happy to cook it.
CAPABILITY_DIMS = ("knife_skill", "multi_tasking", "time_tolerance", "complexity_tolerance")
# Preference dimensions where any mismatch (in either direction) is a miss.
PREFERENCE_DIMS = ("spice_preference", "adventurousness", "healthy_bias")

RANKING_WEIGHTS = {
    "taste_similarity": 0.35,
    "ability_match": 0.25,
    "novelty": 0.15,
    "health_goal": 0.10,
    "budget_fit": 0.10,
    "trending": 0.05,
}

STRESS_ADJUSTMENTS = {
    "taste_similarity": 0.20,
    "ability_match": 0.40,
    "novelty": 0.05,
    "health_goal": 0.05,
    "budget_fit": 0.20,
    "trending": 0.10,
}


async def recommend(
    db: AsyncSession,
    user_id: str,
    meal_slot: str | None = None,
    n: int = 20,
    deadline_stress: float = 0.0,
    exclude_ids: list[str] | None = None,
    exploration_rate: float | None = None,
    temperature: float | None = None,
    rng: random.Random | None = None,
) -> list[dict]:
    """Reactive recommendation engine (issue #61).

    Multi-stage pipeline that, after the hard filters and embedding-nearest
    retrieval seeded by the #60 recipe embeddings and #59 user profile, ranks
    candidates and then injects temperature-controlled wildcards so the swipe
    deck does not collapse into an echo chamber.
    """
    exclude_ids = exclude_ids or []
    rate = EXPLORATION_RATE if exploration_rate is None else exploration_rate
    temp = EXPLORATION_TEMPERATURE if temperature is None else temperature

    user = await _get_user(db, user_id)
    if not user:
        return []

    weights = _blend_weights(deadline_stress)
    profile = _ability_profile(user)

    candidates = await _stage1_filter_and_retrieve(db, user, meal_slot, exclude_ids)
    if not candidates:
        return []

    collab_boost = await _collaborative_scores(db, user_id)
    trending_map = await _trending_scores(db)

    seen_ids = await _recently_seen(db, user_id)

    scored = []
    for rec in candidates:
        rid = rec["id"]
        breakdown = {}

        breakdown["taste_similarity"] = _taste_similarity(user, rec)
        breakdown["ability_match"] = _ability_match(profile, rec, deadline_stress)
        breakdown["novelty"] = 0.2 if rid in seen_ids else 0.8
        breakdown["health_goal"] = _health_score(rec, user)
        breakdown["budget_fit"] = _budget_score(rec, user)
        breakdown["trending"] = trending_map.get(rid, 0.3)
        breakdown["collaborative"] = collab_boost.get(rid, 0.0)

        total = sum(breakdown.get(k, 0) * weights[k] for k in weights)
        total += breakdown.get("collaborative", 0) * 0.15

        scored.append({"recipe": rec, "score": total, "breakdown": breakdown})

    return _apply_exploration(scored, n=n, rate=rate, temperature=temp, rng=rng)


def _apply_exploration(
    scored: list[dict],
    n: int,
    rate: float,
    temperature: float,
    rng: random.Random | None = None,
) -> list[dict]:
    """Return the top-``n`` deck with the tail reserved for exploration.

    The strongest ``(1 - rate)`` of the deck are the user's safe picks (ranked
    purely by score). The remaining slots are filled by sampling the rest of the
    candidates with Gaussian noise scaled by ``temperature`` — so wildcards
    actually surface in the returned deck instead of being buried past position
    ``n`` (which is what happened when exploration only reshuffled the tail of
    the *full* candidate list).
    """
    generator = rng or random
    scored.sort(key=lambda x: x["score"], reverse=True)
    if not scored:
        return []

    deck_size = min(n, len(scored))
    n_safe = max(1, round(deck_size * (1 - rate)))
    n_safe = min(n_safe, len(scored))

    safe = scored[:n_safe]
    rest = scored[n_safe:]

    if temperature > 0 and rest:
        for item in rest:
            item["explore_score"] = item["score"] + generator.gauss(0, temperature)
        rest.sort(key=lambda x: x["explore_score"], reverse=True)
        for item in rest:
            item.pop("explore_score", None)

    return (safe + rest)[:n]


async def _get_user(db: AsyncSession, user_id: str) -> dict | None:
    row = await db.execute(
        text("SELECT * FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    r = row.mappings().first()
    if not r:
        return None
    return dict(r)


async def _stage1_filter_and_retrieve(
    db: AsyncSession,
    user: dict,
    meal_slot: str | None,
    exclude_ids: list[str],
) -> list[dict]:
    conditions = []
    params: dict = {}

    allergens = user.get("allergens", [])
    if allergens:
        conditions.append("NOT (allergens && :allergens)")
        params["allergens"] = allergens

    dislikes = user.get("dislikes", [])
    if dislikes:
        conditions.append("""
            NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(ingredients) AS ing
                WHERE lower(ing->>'name') = ANY(:dislikes)
            )
        """)
        params["dislikes"] = [d.lower() for d in dislikes]

    dietary = user.get("dietary_tags", [])
    if dietary:
        conditions.append("dietary_tags @> :dietary")
        params["dietary"] = dietary

    max_time = user.get("max_time_minutes", 60)
    conditions.append("prep_minutes <= :max_time")
    params["max_time"] = max_time

    if meal_slot:
        conditions.append(":meal_slot = ANY(meal_slots)")
        params["meal_slot"] = meal_slot

    if exclude_ids:
        conditions.append("id != ALL(:exclude_ids)")
        params["exclude_ids"] = exclude_ids

    where = " AND ".join(conditions) if conditions else "TRUE"

    taste_emb = user.get("taste_embedding")
    if taste_emb:
        query = f"""
            SELECT *, (1 - (embedding <=> CAST(:taste_emb AS vector))) AS sim
            FROM recipes
            WHERE {where} AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:taste_emb AS vector)
            LIMIT 200
        """
        params["taste_emb"] = str(taste_emb)
    else:
        query = f"""
            SELECT *, 0.5 AS sim
            FROM recipes
            WHERE {where}
            ORDER BY random()
            LIMIT 200
        """

    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


async def _collaborative_scores(db: AsyncSession, user_id: str) -> dict[str, float]:
    result = await db.execute(
        text("""
            WITH user_likes AS (
                SELECT recipe_id FROM interactions
                WHERE user_id = :uid AND action IN ('swipe_right', 'cook', 'complete', 'save')
            )
            SELECT cl.recipe_b AS recipe_id, SUM(cl.weight) AS score
            FROM co_likes cl
            WHERE cl.recipe_a IN (SELECT recipe_id FROM user_likes)
              AND cl.recipe_b NOT IN (SELECT recipe_id FROM user_likes)
            GROUP BY cl.recipe_b
            ORDER BY score DESC
            LIMIT 50
        """),
        {"uid": user_id},
    )
    rows = result.mappings().all()
    if not rows:
        return {}
    max_score = max(r["score"] for r in rows)
    if max_score == 0:
        return {}
    return {r["recipe_id"]: r["score"] / max_score for r in rows}


async def _trending_scores(db: AsyncSession) -> dict[str, float]:
    result = await db.execute(text("SELECT recipe_id, score FROM trending ORDER BY score DESC LIMIT 50"))
    rows = result.mappings().all()
    if not rows:
        return {}
    max_score = max(r["score"] for r in rows) or 1
    return {r["recipe_id"]: r["score"] / max_score for r in rows}


async def _recently_seen(db: AsyncSession, user_id: str) -> set[str]:
    result = await db.execute(
        text("""
            SELECT DISTINCT recipe_id FROM interactions
            WHERE user_id = :uid
            ORDER BY recipe_id
            LIMIT 100
        """),
        {"uid": user_id},
    )
    return {r["recipe_id"] for r in result.mappings().all()}


def _ability_profile(user: dict) -> dict[str, float]:
    """The user's 7-dimension cooking-ability & preference profile (issue #59).

    Uses the derived profile stored on the user row when present (every column
    defaults to 0.5), falling back to the ``cooking_ability`` self-rating spread
    across all dimensions for rows that predate the profile pipeline.
    """
    if all(user.get(d) is not None for d in DIMENSIONS):
        return {d: float(user[d]) for d in DIMENSIONS}
    scalar = ABILITY_MAP.get((user.get("cooking_ability") or "basic"), 0.45)
    return {d: scalar for d in DIMENSIONS}


def _taste_similarity(user: dict, recipe: dict) -> float:
    taste = user.get("taste_embedding")
    emb = recipe.get("embedding")
    if taste and emb:
        return _cosine_sim(taste, emb)
    return 0.5


def _ability_match(profile: dict[str, float], recipe: dict, stress: float = 0.0) -> float:
    """Match the user's profile (#59) against the recipe's implied demands (#60).

    Capability dimensions are one-sided (only over-demand is penalised) and the
    penalty sharpens with ``deadline_stress`` so ambitious recipes drop fast
    during crunch weeks. Preference dimensions are symmetric.
    """
    targets = recipe_targets(recipe)
    penalties = []
    for d in CAPABILITY_DIMS:
        over = max(0.0, targets[d] - profile[d])
        penalties.append(min(1.0, over * (1.0 + max(0.0, stress))))
    for d in PREFERENCE_DIMS:
        penalties.append(abs(targets[d] - profile[d]))
    return max(0.0, 1.0 - sum(penalties) / len(penalties))


def _as_vector(v: list[float] | str | None) -> list[float] | None:
    if v is None:
        return None
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
        except (ValueError, TypeError):
            return None
        return parsed if isinstance(parsed, list) else None
    return list(v)


def _cosine_sim(a: list[float] | str, b: list[float] | str) -> float:
    va, vb = _as_vector(a), _as_vector(b)
    if not va or not vb:
        return 0.5
    dot = sum(x * y for x, y in zip(va, vb))
    return max(0, min(1, (dot + 1) / 2))


def _health_score(recipe: dict, user: dict) -> float:
    tags = set(recipe.get("suitability_tags", []) + recipe.get("dietary_tags", []))
    likes = set(user.get("likes", []))
    overlap = len(tags & likes)
    return min(1.0, 0.3 + overlap * 0.2)


def _budget_score(recipe: dict, user: dict) -> float:
    price = recipe.get("price_pence", 500)
    budget = user.get("budget_pence", 5000)
    daily = budget / 7
    if price <= daily * 0.3:
        return 1.0
    if price <= daily * 0.5:
        return 0.7
    if price <= daily:
        return 0.4
    return 0.1


def _blend_weights(stress: float) -> dict[str, float]:
    if stress <= 0:
        return RANKING_WEIGHTS
    blended = {}
    for k in RANKING_WEIGHTS:
        normal = RANKING_WEIGHTS[k]
        stressed = STRESS_ADJUSTMENTS.get(k, normal)
        blended[k] = normal + (stressed - normal) * min(stress, 1.0)
    total = sum(blended.values())
    return {k: v / total for k, v in blended.items()}
