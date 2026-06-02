from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .embeddings import embed_texts


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
