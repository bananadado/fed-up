"""Shared test fixtures for the recommender API.

The suite never touches a real Postgres/pgvector database or the GPU embedding
model. Instead:

* ``DATABASE_URL`` points at an (unused) in-memory SQLite URL so importing
  ``app.db`` succeeds without asyncpg/Postgres.
* The ``get_db`` dependency is overridden with :class:`FakeSession`, a small
  in-memory store that interprets the handful of SQL statements the API issues.
* The embedding model is monkeypatched with a deterministic stub.

This keeps the tests fast and hermetic while still exercising the real request
handlers, Pydantic models, and SQL-orchestration logic.
"""

import hashlib
import json
import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DEVICE", "cpu")
os.environ.setdefault("RECOMMENDER_API_KEY", "test-recommender-api-key")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as db_module  # noqa: E402
from app import embeddings as embeddings_module  # noqa: E402
from app import jobs as jobs_module  # noqa: E402
from app import main as main_module  # noqa: E402
from app.embeddings import EMBEDDING_DIM  # noqa: E402


# ── Deterministic embedding stub ─────────────────────────────────────────────

def fake_embed_single(text: str) -> list[float]:
    """Stable pseudo-embedding derived from the text hash (no torch needed)."""
    seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16)
    vec = []
    for i in range(EMBEDDING_DIM):
        seed = (seed * 1103515245 + 12345 + i) & 0x7FFFFFFF
        vec.append((seed % 1000) / 1000.0 - 0.5)
    norm = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / norm for v in vec]


def fake_embed_texts(texts: list[str]) -> list[list[float]]:
    return [fake_embed_single(t) for t in texts]


def _parse_vector(v) -> list[float] | None:
    """Parse a pgvector value, which the API stores as ``str(list)``."""
    if v is None:
        return None
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
        except (ValueError, TypeError):
            return None
        return parsed if isinstance(parsed, list) else None
    return list(v)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@pytest.fixture(autouse=True)
def mock_embeddings(monkeypatch):
    monkeypatch.setattr(embeddings_module, "embed_single", fake_embed_single)
    monkeypatch.setattr(embeddings_module, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(embeddings_module, "get_model", lambda: None)
    monkeypatch.setattr(main_module, "embed_single", fake_embed_single)
    monkeypatch.setattr(main_module, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(jobs_module, "embed_texts", fake_embed_texts)
    yield


# ── In-memory fake database ──────────────────────────────────────────────────

class _Mappings:
    def __init__(self, rows: list[dict]):
        self._rows = rows

    def all(self) -> list[dict]:
        return self._rows

    def first(self) -> dict | None:
        return self._rows[0] if self._rows else None


class FakeResult:
    def __init__(self, rows: list[dict] | None = None, scalar=None):
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self) -> _Mappings:
        return _Mappings(self._rows)

    def scalar(self):
        return self._scalar

    def all(self) -> list:
        return self._rows


class FakeSession:
    """Interprets the SQL the API issues against in-memory dicts."""

    def __init__(self, store: dict):
        self.store = store
        self.commits = 0

    async def execute(self, statement, params=None):
        params = params or {}
        sql = " ".join(str(statement).split())
        low = sql.lower()

        if low.startswith("select 1"):
            return FakeResult(scalar=1)

        if low.startswith("insert into recipes"):
            self._upsert_recipe(params)
            return FakeResult()

        if low.startswith("insert into users"):
            self.store["users"][params["id"]] = dict(params)
            return FakeResult()

        if low.startswith("insert into interactions"):
            self.store["interactions"].append(dict(params))
            return FakeResult()

        if low.startswith("update recipes set embedding"):
            rec = self.store["recipes"].get(params["rid"])
            if rec is not None:
                rec["embedding"] = params.get("emb")
                rec["embedding_text"] = params.get("txt")
            return FakeResult()

        if low.startswith("update users set"):
            user = self.store["users"].get(params.get("uid"))
            if user is not None:
                for key in (
                    "knife_skill", "multi_tasking", "time_tolerance", "spice_preference",
                    "adventurousness", "healthy_bias", "complexity_tolerance",
                    "taste_embedding", "emb", "taste",
                ):
                    if key in params:
                        col = "taste_embedding" if key in ("emb", "taste") else key
                        user[col] = params[key]
            return FakeResult()

        # ── /recommend pipeline ──
        if "as sim from recipes" in low:
            return FakeResult(rows=self._recommend_candidates(params))

        if "from co_likes" in low:
            return FakeResult(rows=self._co_like_rows(params))

        if "recipe_id, score from trending" in low or "from trending order by score" in low:
            rows = [{"recipe_id": rid, "score": sc} for rid, sc in self.store["trending"].items()]
            rows.sort(key=lambda r: r["score"], reverse=True)
            return FakeResult(rows=rows[:50])

        if "select distinct recipe_id from interactions" in low:
            uid = params.get("uid")
            seen = sorted({
                it["recipe_id"] for it in self.store["interactions"] if it.get("user_id") == uid
            })
            return FakeResult(rows=[{"recipe_id": rid} for rid in seen][:100])

        if "from interactions i" in low and "join recipes r" in low:
            uid = params.get("uid")
            rows = []
            for it in self.store["interactions"]:
                if it.get("user_id") != uid:
                    continue
                rec = self.store["recipes"].get(it.get("recipe_id"))
                if not rec:
                    continue
                rows.append({
                    "action": it.get("action"),
                    "embedding": rec.get("embedding"),
                    "difficulty": rec.get("difficulty"),
                    "techniques": rec.get("techniques") or [],
                    "prep_minutes": rec.get("prep_minutes") or 0,
                    "flavor_profile": rec.get("flavor_profile") or [],
                    "dietary_tags": rec.get("dietary_tags") or [],
                    "suitability_tags": rec.get("suitability_tags") or [],
                    "cuisine": rec.get("cuisine"),
                })
            return FakeResult(rows=rows)

        if low.startswith("select id from users"):
            return FakeResult(rows=[{"id": uid} for uid in self.store["users"]])

        if "select embedding from recipes where id" in low:
            rec = self.store["recipes"].get(params["rid"])
            return FakeResult(rows=[{"embedding": rec["embedding"]}] if rec else [])

        if "from recipes where embedding is null" in low:
            rows = [self._recipe_row(r) for r in self.store["recipes"].values() if not r.get("embedding")]
            return FakeResult(rows=rows)

        if "id != :rid" in low and "from recipes" in low:
            rid = params["rid"]
            rows = [
                {**self._recipe_row(r), "similarity": 0.9}
                for r in self.store["recipes"].values()
                if r["id"] != rid and r.get("embedding")
            ]
            return FakeResult(rows=rows[: params.get("n", 10)])

        if "from recipes where id = :rid" in low:
            rec = self.store["recipes"].get(params["rid"])
            return FakeResult(rows=[self._recipe_row(rec)] if rec else [])

        if "from recipes order by name" in low:
            rows = sorted((self._recipe_row(r) for r in self.store["recipes"].values()), key=lambda r: r["name"])
            return FakeResult(rows=rows)

        if "from users where id = :uid" in low:
            user = self.store["users"].get(params["uid"])
            return FakeResult(rows=[dict(user)] if user else [])

        if "count(*) as c from recipes where embedding is not null" in low:
            return FakeResult(scalar=sum(1 for r in self.store["recipes"].values() if r.get("embedding")))
        if "count(*) as c from recipes" in low:
            return FakeResult(scalar=len(self.store["recipes"]))
        if "count(*) as c from users" in low:
            return FakeResult(scalar=len(self.store["users"]))
        if "count(*) as c from interactions" in low:
            return FakeResult(scalar=len(self.store["interactions"]))

        # Unhandled queries (recommend/collab/trending) default to empty so the
        # branch that owns them can extend the fake without breaking others.
        return FakeResult()

    async def commit(self):
        self.commits += 1

    # ── helpers ──
    def _upsert_recipe(self, params: dict):
        row = dict(params)
        ingredients = row.get("ingredients")
        if isinstance(ingredients, str):
            row["ingredients"] = json.loads(ingredients)
        nutrition = row.get("nutrition")
        if isinstance(nutrition, str) and nutrition:
            row["nutrition"] = json.loads(nutrition)
        self.store["recipes"][row["id"]] = row

    def _recipe_row(self, r: dict) -> dict:
        return dict(r) if r else {}

    def _recommend_candidates(self, params: dict) -> list[dict]:
        """Emulate stage-1 hard filtering + embedding-ordered retrieval."""
        allergens = set(params.get("allergens") or [])
        dislikes = set(params.get("dislikes") or [])  # already lower-cased by the API
        dietary_groups = [
            set(value)
            for key, value in params.items()
            if key.startswith("dietary_") and isinstance(value, list)
        ]
        ingredient_exclusion_patterns = [
            str(pattern).strip("%")
            for pattern in (params.get("ingredient_exclusion_patterns") or [])
        ]
        max_time = params.get("max_time")
        meal_slot = params.get("meal_slot")
        exclude = set(params.get("exclude_ids") or [])
        taste = _parse_vector(params.get("taste_emb"))

        out = []
        for r in self.store["recipes"].values():
            if taste is not None and not r.get("embedding"):
                continue  # WHERE embedding IS NOT NULL
            recipe_allergens = {str(a).lower() for a in (r.get("allergens") or [])}
            if allergens and (recipe_allergens & allergens):
                continue
            if dislikes:
                names = {
                    str(i.get("name", "")).lower()
                    for i in (r.get("ingredients") or [])
                    if isinstance(i, dict)
                }
                if names & dislikes:
                    continue
            if ingredient_exclusion_patterns:
                names = {
                    str(i.get("name", "")).lower()
                    for i in (r.get("ingredients") or [])
                    if isinstance(i, dict)
                }
                if any(pattern in name for pattern in ingredient_exclusion_patterns for name in names):
                    continue
            recipe_dietary = {str(t).lower() for t in (r.get("dietary_tags") or [])}
            if any(recipe_dietary.isdisjoint(group) for group in dietary_groups):
                continue
            if max_time is not None and (r.get("prep_minutes") or 0) > max_time:
                continue
            if meal_slot and meal_slot not in (r.get("meal_slots") or []):
                continue
            if r["id"] in exclude:
                continue

            row = dict(r)
            if taste is not None:
                vec = _parse_vector(r.get("embedding"))
                row["sim"] = _cosine(taste, vec) if vec else 0.0
            else:
                row["sim"] = 0.5
            out.append(row)

        if taste is not None:
            out.sort(key=lambda x: x["sim"], reverse=True)
        return out[:200]

    def _co_like_rows(self, params: dict) -> list[dict]:
        uid = params.get("uid")
        positive = {"swipe_right", "cook", "complete", "save"}
        likes = {
            it["recipe_id"]
            for it in self.store["interactions"]
            if it.get("user_id") == uid and it.get("action") in positive
        }
        agg: dict[str, float] = {}
        for cl in self.store["co_likes"]:
            if cl["recipe_a"] in likes and cl["recipe_b"] not in likes:
                agg[cl["recipe_b"]] = agg.get(cl["recipe_b"], 0.0) + cl["weight"]
        rows = [{"recipe_id": rid, "score": sc} for rid, sc in agg.items()]
        rows.sort(key=lambda r: r["score"], reverse=True)
        return rows[:50]


@pytest.fixture
def store() -> dict:
    return {"recipes": {}, "users": {}, "interactions": [], "co_likes": [], "trending": {}}


@pytest.fixture
def client(store):
    session = FakeSession(store)

    async def override_get_db():
        yield session

    main_module.app.dependency_overrides[db_module.get_db] = override_get_db
    with TestClient(
        main_module.app,
        headers={"X-Deadline-Food-API-Key": os.environ["RECOMMENDER_API_KEY"]},
    ) as c:
        c.fake_session = session  # type: ignore[attr-defined]
        yield c
    main_module.app.dependency_overrides.clear()


# ── Sample payloads ──────────────────────────────────────────────────────────

def sample_recipe(**overrides) -> dict:
    base = {
        "id": "r1",
        "name": "Spicy Thai Basil Chicken",
        "meal_type": "cook",
        "meal_slots": ["dinner"],
        "price_pence": 350,
        "prep_minutes": 25,
        "dietary_tags": ["high-protein"],
        "allergens": ["soy"],
        "suitability_tags": ["batch-friendly"],
        "ingredients": [{"name": "chicken thigh", "quantity": 300, "unit": "g"}, {"name": "thai basil"}],
        "instructions": ["Chop", "Stir fry", "Serve"],
        "cuisine": "Thai",
        "flavor_profile": ["spicy", "umami"],
        "techniques": ["stir fry", "reduce sauce"],
        "equipment": ["wok"],
        "nutrition": {"calories": 500, "protein": 40, "carbs": 30, "fat": 20},
        "source": "seed",
        "note": "Weeknight favourite",
    }
    base.update(overrides)
    return base


def sample_user(**overrides) -> dict:
    base = {
        "id": "u1",
        "cooking_ability": "intermediate",
        "kitchen_access": "full",
        "budget_pence": 3500,
        "max_time_minutes": 40,
        "dietary_tags": [],
        "allergens": [],
        "dislikes": [],
        "likes": [],
        "university": "Imperial",
        "postcode": "SW7",
    }
    base.update(overrides)
    return base
