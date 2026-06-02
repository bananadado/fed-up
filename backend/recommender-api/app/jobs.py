import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .ability import (
    DIMENSIONS,
    DISLIKE_WEIGHTS,
    LIKE_WEIGHTS,
    derive_ability_profile,
)
from .embeddings import EMBEDDING_DIM, embed_texts

POSITIVE_ACTIONS = set(LIKE_WEIGHTS)
NEGATIVE_ACTIONS = set(DISLIKE_WEIGHTS)

# How strongly disliked recipes push the taste embedding away from their region.
DISLIKE_EMBED_FACTOR = 0.5


def _parse_embedding(emb) -> list[float] | None:
    if emb is None:
        return None
    if isinstance(emb, str):
        try:
            return json.loads(emb)
        except json.JSONDecodeError:
            return None
    return list(emb)


async def recompute_user_profile(db: AsyncSession, user_id: str) -> bool:
    """Recompute a user's taste embedding *and* ability profile (issue #59).

    Pulls the user's recent interactions joined with recipe metadata, splits
    them into liked / disliked, derives the ability profile from onboarding +
    behaviour, and computes a taste embedding as
    ``mean(liked) - factor * mean(disliked)``.
    """
    user_row = await db.execute(text("SELECT * FROM users WHERE id = :uid"), {"uid": user_id})
    user = user_row.mappings().first()
    if not user:
        return False
    user = dict(user)

    result = await db.execute(
        text("""
            SELECT i.action AS action, r.embedding AS embedding, r.difficulty AS difficulty,
                   r.techniques AS techniques, r.prep_minutes AS prep_minutes,
                   r.flavor_profile AS flavor_profile, r.dietary_tags AS dietary_tags,
                   r.suitability_tags AS suitability_tags, r.cuisine AS cuisine
            FROM interactions i
            JOIN recipes r ON r.id = i.recipe_id
            WHERE i.user_id = :uid
            ORDER BY i.created_at DESC
            LIMIT 200
        """),
        {"uid": user_id},
    )
    rows = [dict(r) for r in result.mappings().all()]

    liked, liked_w, disliked, disliked_w = [], [], [], []
    for row in rows:
        recipe = {
            "difficulty": row.get("difficulty"),
            "techniques": row.get("techniques") or [],
            "prep_minutes": row.get("prep_minutes") or 0,
            "flavor_profile": row.get("flavor_profile") or [],
            "dietary_tags": row.get("dietary_tags") or [],
            "suitability_tags": row.get("suitability_tags") or [],
            "cuisine": row.get("cuisine"),
            "embedding": _parse_embedding(row.get("embedding")),
        }
        action = row.get("action")
        if action in POSITIVE_ACTIONS:
            liked.append(recipe)
            liked_w.append(LIKE_WEIGHTS[action])
        elif action in NEGATIVE_ACTIONS:
            disliked.append(recipe)
            disliked_w.append(DISLIKE_WEIGHTS[action])

    profile = derive_ability_profile(user, liked, liked_w, disliked, disliked_w)
    taste = _compute_taste_embedding(liked, liked_w, disliked, disliked_w)

    set_clauses = [f"{d} = :{d}" for d in DIMENSIONS]
    params = {d: profile[d] for d in DIMENSIONS}
    params["uid"] = user_id
    if taste is not None:
        set_clauses.append("taste_embedding = CAST(:taste AS vector)")
        params["taste"] = str(taste)

    await db.execute(
        text(f"UPDATE users SET {', '.join(set_clauses)}, updated_at = now() WHERE id = :uid"),
        params,
    )
    await db.commit()
    return True


def _compute_taste_embedding(liked, liked_w, disliked, disliked_w) -> list[float] | None:
    liked_embs = [(r["embedding"], w) for r, w in zip(liked, liked_w) if r.get("embedding")]
    if not liked_embs:
        return None
    disliked_embs = [(r["embedding"], w) for r, w in zip(disliked, disliked_w) if r.get("embedding")]

    acc = [0.0] * EMBEDDING_DIM
    total = sum(w for _, w in liked_embs)
    for emb, w in liked_embs:
        for i in range(EMBEDDING_DIM):
            acc[i] += emb[i] * w
    acc = [v / total for v in acc]

    if disliked_embs:
        neg = [0.0] * EMBEDDING_DIM
        dtotal = sum(w for _, w in disliked_embs)
        for emb, w in disliked_embs:
            for i in range(EMBEDDING_DIM):
                neg[i] += emb[i] * w
        acc = [acc[i] - DISLIKE_EMBED_FACTOR * (neg[i] / dtotal) for i in range(EMBEDDING_DIM)]

    norm = sum(v * v for v in acc) ** 0.5 or 1.0
    return [v / norm for v in acc]


async def recompute_all_user_profiles(db: AsyncSession) -> int:
    result = await db.execute(text("SELECT id FROM users"))
    user_ids = [r["id"] for r in result.mappings().all()]
    updated = 0
    for uid in user_ids:
        if await recompute_user_profile(db, uid):
            updated += 1
    return updated


async def recompute_user_embedding(db: AsyncSession, user_id: str) -> bool:
    result = await db.execute(
        text("""
            SELECT r.embedding, i.action
            FROM interactions i
            JOIN recipes r ON r.id = i.recipe_id
            WHERE i.user_id = :uid
              AND i.action IN ('swipe_right', 'cook', 'complete', 'save')
              AND r.embedding IS NOT NULL
            ORDER BY i.created_at DESC
            LIMIT 100
        """),
        {"uid": user_id},
    )
    rows = result.mappings().all()
    if not rows:
        return False

    action_weights = {"complete": 2.0, "cook": 1.5, "save": 1.2, "swipe_right": 1.0}

    dims = 384
    acc = [0.0] * dims
    total_weight = 0.0

    for row in rows:
        emb = row["embedding"]
        if emb is None:
            continue
        w = action_weights.get(row["action"], 1.0)
        total_weight += w
        for i in range(dims):
            acc[i] += emb[i] * w

    if total_weight == 0:
        return False

    avg = [v / total_weight for v in acc]

    await db.execute(
        text("UPDATE users SET taste_embedding = CAST(:emb AS vector), updated_at = now() WHERE id = :uid"),
        {"emb": str(avg), "uid": user_id},
    )
    await db.commit()
    return True


async def recompute_co_likes(db: AsyncSession) -> int:
    await db.execute(text("TRUNCATE co_likes"))

    result = await db.execute(text("""
        INSERT INTO co_likes (recipe_a, recipe_b, weight)
        SELECT a.recipe_id, b.recipe_id, COUNT(DISTINCT a.user_id)::real
        FROM interactions a
        JOIN interactions b ON a.user_id = b.user_id AND a.recipe_id < b.recipe_id
        WHERE a.action IN ('swipe_right', 'cook', 'complete', 'save')
          AND b.action IN ('swipe_right', 'cook', 'complete', 'save')
        GROUP BY a.recipe_id, b.recipe_id
        HAVING COUNT(DISTINCT a.user_id) >= 1
        ON CONFLICT (recipe_a, recipe_b) DO UPDATE SET weight = EXCLUDED.weight
        RETURNING 1
    """))
    count = len(result.all())
    await db.commit()
    return count


async def recompute_trending(db: AsyncSession) -> int:
    await db.execute(text("TRUNCATE trending"))
    result = await db.execute(text("""
        INSERT INTO trending (recipe_id, score, computed_at)
        SELECT recipe_id,
               SUM(CASE
                   WHEN action = 'complete' THEN 3
                   WHEN action = 'cook' THEN 2
                   WHEN action IN ('swipe_right', 'save') THEN 1
                   ELSE 0
               END)::real AS score,
               now()
        FROM interactions
        WHERE created_at > now() - INTERVAL '7 days'
          AND action IN ('swipe_right', 'cook', 'complete', 'save')
        GROUP BY recipe_id
        HAVING SUM(CASE
                   WHEN action = 'complete' THEN 3
                   WHEN action = 'cook' THEN 2
                   WHEN action IN ('swipe_right', 'save') THEN 1
                   ELSE 0
               END) > 0
        RETURNING 1
    """))
    count = len(result.all())
    await db.commit()
    return count


async def recompute_all_user_embeddings(db: AsyncSession) -> int:
    result = await db.execute(text("SELECT id FROM users"))
    user_ids = [r["id"] for r in result.mappings().all()]
    updated = 0
    for uid in user_ids:
        if await recompute_user_embedding(db, uid):
            updated += 1
    return updated


async def embed_unembedded_recipes(db: AsyncSession) -> int:
    result = await db.execute(
        text("SELECT id, name, meal_type, meal_slots, prep_minutes, dietary_tags, allergens, suitability_tags, ingredients, instructions, cuisine, flavor_profile, techniques, equipment, note FROM recipes WHERE embedding IS NULL")
    )
    rows = result.mappings().all()
    if not rows:
        return 0

    from .embeddings import synthesize_recipe_text

    texts = []
    ids = []
    for row in rows:
        recipe_dict = dict(row)
        synth = synthesize_recipe_text(recipe_dict)
        texts.append(synth)
        ids.append((row["id"], synth))

    embeddings = embed_texts(texts)

    for (rid, synth), emb in zip(ids, embeddings):
        await db.execute(
            text("UPDATE recipes SET embedding = CAST(:emb AS vector), embedding_text = :txt, updated_at = now() WHERE id = :rid"),
            {"emb": str(emb), "txt": synth, "rid": rid},
        )

    await db.commit()
    return len(ids)
