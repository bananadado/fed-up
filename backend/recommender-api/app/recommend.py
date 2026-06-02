import os
import random

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

EXPLORATION_RATE = float(os.environ.get("EXPLORATION_RATE", "0.2"))
EXPLORATION_TEMPERATURE = float(os.environ.get("EXPLORATION_TEMPERATURE", "0.15"))

ABILITY_MAP = {"beginner": 0.25, "basic": 0.45, "intermediate": 0.65, "advanced": 0.85}

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
) -> list[dict]:
    exclude_ids = exclude_ids or []

    user = await _get_user(db, user_id)
    if not user:
        return []

    weights = _blend_weights(deadline_stress)

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

        if user.get("taste_embedding") and rec.get("embedding"):
            breakdown["taste_similarity"] = _cosine_sim(user["taste_embedding"], rec["embedding"])
        else:
            breakdown["taste_similarity"] = 0.5

        user_ability = ABILITY_MAP.get(user.get("cooking_ability", "basic"), 0.45)
        diff = rec.get("difficulty", 0.5)
        breakdown["ability_match"] = max(0, 1.0 - abs(user_ability - diff) * 2)

        if deadline_stress > 0.5:
            if diff > user_ability + 0.1:
                breakdown["ability_match"] *= 0.5

        breakdown["novelty"] = 0.2 if rid in seen_ids else 0.8

        breakdown["health_goal"] = _health_score(rec, user)
        breakdown["budget_fit"] = _budget_score(rec, user)
        breakdown["trending"] = trending_map.get(rid, 0.3)

        breakdown["collaborative"] = collab_boost.get(rid, 0.0)

        total = sum(breakdown.get(k, 0) * weights[k] for k in weights)
        total += breakdown.get("collaborative", 0) * 0.15

        scored.append({"recipe": rec, "score": total, "breakdown": breakdown})

    scored.sort(key=lambda x: x["score"], reverse=True)

    safe_count = max(1, int(len(scored) * (1 - EXPLORATION_RATE)))
    safe = scored[:safe_count]
    explore_pool = scored[safe_count:]

    for item in explore_pool:
        item["score"] += random.gauss(0, EXPLORATION_TEMPERATURE)

    explore_pool.sort(key=lambda x: x["score"], reverse=True)

    result = safe + explore_pool
    return result[:n]


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


def _cosine_sim(a: list[float] | str, b: list[float] | str) -> float:
    if isinstance(a, str) or isinstance(b, str):
        return 0.5
    dot = sum(x * y for x, y in zip(a, b))
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
