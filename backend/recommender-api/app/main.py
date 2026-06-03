import json
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import verify_cloud_function
from .context import extract_context
from .db import get_db
from .difficulty import score_difficulty
from .embeddings import embed_single, synthesize_recipe_text
from .jobs import (
    NEGATIVE_ACTIONS,
    POSITIVE_ACTIONS,
    embed_unembedded_recipes,
    recompute_all_user_embeddings,
    recompute_all_user_profiles,
    recompute_co_likes,
    recompute_trending,
    recompute_user_profile,
)
from .ability import DIMENSIONS
from .models import (
    ContextRequest,
    InteractionIn,
    RecipeIn,
    RecipeOut,
    RecommendRequest,
    ScoredRecipe,
    UserIn,
)
from .recommend import recommend

from prometheus_fastapi_instrumentator import Instrumentator


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .embeddings import get_model
    get_model()
    yield


app = FastAPI(
    title="Deadline Food Recommender",
    description="Multi-stage recipe recommendation engine with GPU-accelerated embeddings",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(verify_cloud_function)],
)

Instrumentator(
    should_group_status_codes=True,
    should_group_untemplated=True,
    excluded_handlers=["/metrics"],
).instrument(app).expose(app, endpoint="/metrics")


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}


# ── Recipes ─────────────────────────────────────────────────────────────────

@app.post("/recipes", response_model=RecipeOut)
async def create_recipe(recipe: RecipeIn, db: AsyncSession = Depends(get_db)):
    recipe_dict = recipe.model_dump()
    difficulty = score_difficulty(recipe_dict)
    synth = synthesize_recipe_text(recipe_dict)
    embedding = embed_single(synth)

    await db.execute(
        text("""
            INSERT INTO recipes (id, name, meal_type, meal_slots, price_pence, prep_minutes,
                difficulty, dietary_tags, allergens, suitability_tags, ingredients, instructions,
                cuisine, flavor_profile, techniques, equipment, nutrition, source, note,
                embedding_text, embedding)
            VALUES (:id, :name, :meal_type, :meal_slots, :price_pence, :prep_minutes,
                :difficulty, :dietary_tags, :allergens, :suitability_tags, CAST(:ingredients AS jsonb), :instructions,
                :cuisine, :flavor_profile, :techniques, :equipment, CAST(:nutrition AS jsonb), :source, :note,
                :embedding_text, CAST(:embedding AS vector))
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name, meal_type = EXCLUDED.meal_type, meal_slots = EXCLUDED.meal_slots,
                price_pence = EXCLUDED.price_pence, prep_minutes = EXCLUDED.prep_minutes,
                difficulty = EXCLUDED.difficulty, dietary_tags = EXCLUDED.dietary_tags,
                allergens = EXCLUDED.allergens, suitability_tags = EXCLUDED.suitability_tags,
                ingredients = EXCLUDED.ingredients, instructions = EXCLUDED.instructions,
                cuisine = EXCLUDED.cuisine, flavor_profile = EXCLUDED.flavor_profile,
                techniques = EXCLUDED.techniques, equipment = EXCLUDED.equipment,
                nutrition = EXCLUDED.nutrition, source = EXCLUDED.source, note = EXCLUDED.note,
                embedding_text = EXCLUDED.embedding_text, embedding = EXCLUDED.embedding,
                updated_at = now()
        """),
        {
            **recipe_dict,
            "difficulty": difficulty,
            "embedding_text": synth,
            "embedding": str(embedding),
            "ingredients": json.dumps(recipe_dict["ingredients"]),
            "nutrition": json.dumps(recipe_dict["nutrition"]) if recipe_dict.get("nutrition") else None,
        },
    )
    await db.commit()
    return RecipeOut(**recipe_dict, difficulty=difficulty, embedding_text=synth)


@app.post("/recipes/bulk", response_model=list[RecipeOut])
async def bulk_create_recipes(recipes: list[RecipeIn], db: AsyncSession = Depends(get_db)):
    results = []
    for recipe in recipes:
        r = await create_recipe(recipe, db)
        results.append(r)
    return results


@app.get("/recipes", response_model=list[RecipeOut])
async def list_recipes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM recipes ORDER BY name"))
    rows = result.mappings().all()
    return [_row_to_recipe(r) for r in rows]


@app.get("/recipes/{recipe_id}", response_model=RecipeOut)
async def get_recipe(recipe_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM recipes WHERE id = :rid"), {"rid": recipe_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Recipe not found")
    return _row_to_recipe(row)


# ── Users ───────────────────────────────────────────────────────────────────

@app.post("/users")
async def create_user(user: UserIn, db: AsyncSession = Depends(get_db)):
    d = user.model_dump()
    await db.execute(
        text("""
            INSERT INTO users (id, cooking_ability, kitchen_access, budget_pence, max_time_minutes,
                dietary_tags, allergens, dislikes, likes, university, postcode)
            VALUES (:id, :cooking_ability, :kitchen_access, :budget_pence, :max_time_minutes,
                :dietary_tags, :allergens, :dislikes, :likes, :university, :postcode)
            ON CONFLICT (id) DO UPDATE SET
                cooking_ability = EXCLUDED.cooking_ability, kitchen_access = EXCLUDED.kitchen_access,
                budget_pence = EXCLUDED.budget_pence, max_time_minutes = EXCLUDED.max_time_minutes,
                dietary_tags = EXCLUDED.dietary_tags, allergens = EXCLUDED.allergens,
                dislikes = EXCLUDED.dislikes, likes = EXCLUDED.likes,
                university = EXCLUDED.university, postcode = EXCLUDED.postcode,
                updated_at = now()
        """),
        d,
    )
    await db.commit()
    # Derive the ability profile from onboarding immediately so a freshly
    # created user is embedded on creation (taste embedding fills in once
    # interactions arrive).
    await recompute_user_profile(db, user.id)
    return {"status": "ok", "user_id": user.id}


@app.get("/users/{user_id}")
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM users WHERE id = :uid"), {"uid": user_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "User not found")
    return dict(row)


@app.get("/users/{user_id}/ability")
async def get_user_ability(user_id: str, db: AsyncSession = Depends(get_db)):
    """Return the user's derived cooking-ability & preference profile (#59)."""
    result = await db.execute(text("SELECT * FROM users WHERE id = :uid"), {"uid": user_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "User not found")
    d = dict(row)
    return {dim: d.get(dim, 0.5) for dim in DIMENSIONS}


@app.post("/users/{user_id}/recompute-profile")
async def recompute_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    """Force-recompute a single user's taste embedding and ability profile (#59)."""
    ok = await recompute_user_profile(db, user_id)
    if not ok:
        raise HTTPException(404, "User not found")
    return {"status": "ok", "user_id": user_id}


# ── Interactions ────────────────────────────────────────────────────────────

@app.post("/interactions")
async def record_interaction(interaction: InteractionIn, db: AsyncSession = Depends(get_db)):
    d = interaction.model_dump()
    await db.execute(
        text("""
            INSERT INTO interactions (user_id, recipe_id, action, dwell_seconds, context)
            VALUES (:user_id, :recipe_id, :action, :dwell_seconds, CAST(:context AS jsonb))
        """),
        {**d, "context": json.dumps(d["context"]) if d.get("context") else None},
    )
    await db.commit()

    # Both positive and negative signals reshape the user's taste/ability
    # profile, so recompute whenever discovery feedback arrives.
    if interaction.action in POSITIVE_ACTIONS or interaction.action in NEGATIVE_ACTIONS:
        await recompute_user_profile(db, interaction.user_id)

    return {"status": "ok"}


# ── Recommendations ─────────────────────────────────────────────────────────

@app.post("/recommend", response_model=list[ScoredRecipe])
async def get_recommendations(req: RecommendRequest, db: AsyncSession = Depends(get_db)):
    results = await recommend(
        db,
        user_id=req.user_id,
        meal_slot=req.meal_slot,
        n=req.n,
        deadline_stress=req.deadline_stress,
        exclude_ids=req.exclude_ids,
        exploration_rate=req.exploration_rate,
        temperature=req.temperature,
    )
    return [
        ScoredRecipe(
            recipe=_row_to_recipe(r["recipe"]),
            score=r["score"],
            breakdown=r["breakdown"],
        )
        for r in results
    ]


# ── Context / deadline extraction ───────────────────────────────────────────

@app.post("/context/deadlines")
async def context_deadlines(req: ContextRequest):
    """Extract academic deadlines and per-day cooking-pressure context (#65).

    Pure inference over calendar events — no DB. The per-day ``stress`` score is
    designed to be fed back as ``deadline_stress`` to ``/recommend``.
    """
    today = date.fromisoformat(req.today) if req.today else None
    events = [e.model_dump() for e in req.events]
    return extract_context(events, today=today, horizon_days=req.horizon_days)


# ── Batch Jobs (triggered via API) ─────────────────────────────────────────

@app.post("/jobs/embed-recipes")
async def job_embed_recipes(db: AsyncSession = Depends(get_db)):
    count = await embed_unembedded_recipes(db)
    return {"embedded": count}


@app.post("/jobs/recompute-user-embeddings")
async def job_recompute_users(db: AsyncSession = Depends(get_db)):
    count = await recompute_all_user_embeddings(db)
    return {"updated": count}


@app.post("/jobs/recompute-user-profiles")
async def job_recompute_user_profiles(db: AsyncSession = Depends(get_db)):
    count = await recompute_all_user_profiles(db)
    return {"updated": count}


@app.post("/jobs/recompute-co-likes")
async def job_recompute_colikes(db: AsyncSession = Depends(get_db)):
    count = await recompute_co_likes(db)
    return {"pairs": count}


@app.post("/jobs/recompute-trending")
async def job_recompute_trending(db: AsyncSession = Depends(get_db)):
    count = await recompute_trending(db)
    return {"recipes": count}


@app.post("/jobs/recompute-all")
async def job_recompute_all(db: AsyncSession = Depends(get_db)):
    embedded = await embed_unembedded_recipes(db)
    users = await recompute_all_user_profiles(db)
    colikes = await recompute_co_likes(db)
    trending = await recompute_trending(db)
    return {"embedded": embedded, "user_profiles": users, "co_likes": colikes, "trending": trending}


# ── Similar recipes ─────────────────────────────────────────────────────────

@app.get("/recipes/{recipe_id}/similar", response_model=list[RecipeOut])
async def similar_recipes(recipe_id: str, n: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT embedding FROM recipes WHERE id = :rid"),
        {"rid": recipe_id},
    )
    row = result.mappings().first()
    if not row or row["embedding"] is None:
        raise HTTPException(404, "Recipe not found or not embedded")

    result = await db.execute(
        text("""
            SELECT *, (1 - (embedding <=> CAST(:emb AS vector))) AS similarity
            FROM recipes
            WHERE id != :rid AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:emb AS vector)
            LIMIT :n
        """),
        {"emb": str(row["embedding"]), "rid": recipe_id, "n": n},
    )
    return [_row_to_recipe(r) for r in result.mappings().all()]


# ── Stats ───────────────────────────────────────────────────────────────────

@app.get("/stats")
async def stats(db: AsyncSession = Depends(get_db)):
    recipes = (await db.execute(text("SELECT COUNT(*) AS c FROM recipes"))).scalar()
    embedded = (await db.execute(text("SELECT COUNT(*) AS c FROM recipes WHERE embedding IS NOT NULL"))).scalar()
    users = (await db.execute(text("SELECT COUNT(*) AS c FROM users"))).scalar()
    interactions = (await db.execute(text("SELECT COUNT(*) AS c FROM interactions"))).scalar()
    return {
        "recipes": recipes,
        "recipes_embedded": embedded,
        "users": users,
        "interactions": interactions,
    }


# ── Helpers ─────────────────────────────────────────────────────────────────

def _row_to_recipe(row) -> RecipeOut:
    d = dict(row) if hasattr(row, "_mapping") else dict(row)
    d.pop("embedding", None)
    d.pop("sim", None)
    d.pop("similarity", None)
    d.pop("created_at", None)
    d.pop("updated_at", None)

    ingredients = d.get("ingredients", [])
    if isinstance(ingredients, str):
        ingredients = json.loads(ingredients)

    nutrition = d.get("nutrition")
    if isinstance(nutrition, str):
        nutrition = json.loads(nutrition)

    return RecipeOut(
        id=d["id"],
        name=d["name"],
        meal_type=d["meal_type"],
        meal_slots=list(d.get("meal_slots", [])),
        price_pence=d.get("price_pence", 0),
        prep_minutes=d.get("prep_minutes", 0),
        difficulty=d.get("difficulty", 0.5),
        dietary_tags=list(d.get("dietary_tags", [])),
        allergens=list(d.get("allergens", [])),
        suitability_tags=list(d.get("suitability_tags", [])),
        ingredients=ingredients,
        instructions=list(d.get("instructions", [])),
        cuisine=d.get("cuisine"),
        flavor_profile=list(d.get("flavor_profile", [])),
        techniques=list(d.get("techniques", [])),
        equipment=list(d.get("equipment", [])),
        nutrition=nutrition,
        source=d.get("source"),
        note=d.get("note"),
        embedding_text=d.get("embedding_text"),
    )
