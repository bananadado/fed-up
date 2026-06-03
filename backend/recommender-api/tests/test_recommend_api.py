"""Endpoint tests for the reactive recommendation engine (issue #61).

Drives ``POST /recommend`` through the in-memory ``FakeSession``, which
interprets the multi-stage pipeline's SQL: hard filtering, embedding-ordered
retrieval, collaborative + trending candidates and recently-seen novelty. The
pure ranking/exploration maths is unit-tested in ``test_recommend_unit.py``.
"""

from .conftest import sample_recipe, sample_user

BREAKDOWN_KEYS = {
    "taste_similarity", "ability_match", "novelty",
    "health_goal", "budget_fit", "trending", "collaborative",
}


def _seed_user(client, **overrides):
    assert client.post("/users", json=sample_user(**overrides)).status_code == 200


def _seed_recipe(client, **overrides):
    assert client.post("/recipes", json=sample_recipe(**overrides)).status_code == 200


def _recommend(client, **body):
    body.setdefault("user_id", "u1")
    # Deterministic ordering for assertions unless a test opts into exploration.
    body.setdefault("temperature", 0.0)
    resp = client.post("/recommend", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── Basic behaviour ───────────────────────────────────────────────────────────

def test_recommend_unknown_user_returns_empty(client):
    assert _recommend(client, user_id="ghost") == []


def test_recommend_no_recipes_returns_empty(client):
    _seed_user(client)
    assert _recommend(client) == []


def test_recommend_returns_scored_recipes_with_full_breakdown(client):
    _seed_user(client)
    _seed_recipe(client, id="r1")
    results = _recommend(client)
    assert len(results) == 1
    item = results[0]
    assert item["recipe"]["id"] == "r1"
    assert isinstance(item["score"], float)
    assert BREAKDOWN_KEYS.issubset(item["breakdown"].keys())


def test_recommend_respects_n_limit(client):
    _seed_user(client, max_time_minutes=999)
    for i in range(5):
        _seed_recipe(client, id=f"r{i}", name=f"Recipe {i}")
    assert len(_recommend(client, n=3)) == 3


def test_recommend_results_sorted_by_score(client):
    _seed_user(client, max_time_minutes=999)
    for i in range(6):
        _seed_recipe(client, id=f"r{i}", name=f"Recipe {i}", price_pence=200 + i * 400)
    results = _recommend(client, n=6, exploration_rate=0.0)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


# ── Stage-1 hard filters ──────────────────────────────────────────────────────

def test_allergens_are_hard_filtered(client):
    _seed_user(client, allergens=["peanut"], max_time_minutes=999)
    _seed_recipe(client, id="safe", name="Safe", allergens=[])
    _seed_recipe(client, id="nuts", name="Nutty", allergens=["peanut"])
    ids = {r["recipe"]["id"] for r in _recommend(client)}
    assert ids == {"safe"}


def test_disliked_ingredients_are_hard_filtered(client):
    _seed_user(client, dislikes=["chicken thigh"], max_time_minutes=999)
    _seed_recipe(client, id="chick", name="Chicken",
                 ingredients=[{"name": "chicken thigh"}])
    _seed_recipe(client, id="tofu", name="Tofu", ingredients=[{"name": "tofu"}])
    ids = {r["recipe"]["id"] for r in _recommend(client)}
    assert ids == {"tofu"}


def test_dietary_tags_are_required(client):
    _seed_user(client, dietary_tags=["vegan"], max_time_minutes=999)
    _seed_recipe(client, id="vegan", name="Vegan", dietary_tags=["vegan"])
    _seed_recipe(client, id="meaty", name="Meaty", dietary_tags=["high-protein"])
    ids = {r["recipe"]["id"] for r in _recommend(client)}
    assert ids == {"vegan"}


def test_max_time_is_hard_filtered(client):
    _seed_user(client, max_time_minutes=20)
    _seed_recipe(client, id="quick", name="Quick", prep_minutes=15)
    _seed_recipe(client, id="slow", name="Slow", prep_minutes=60)
    ids = {r["recipe"]["id"] for r in _recommend(client)}
    assert ids == {"quick"}


def test_meal_slot_is_hard_filtered(client):
    _seed_user(client, max_time_minutes=999)
    _seed_recipe(client, id="brk", name="Breakfast", meal_slots=["breakfast"])
    _seed_recipe(client, id="din", name="Dinner", meal_slots=["dinner"])
    ids = {r["recipe"]["id"] for r in _recommend(client, meal_slot="breakfast")}
    assert ids == {"brk"}


def test_exclude_ids_are_filtered(client):
    _seed_user(client, max_time_minutes=999)
    _seed_recipe(client, id="keep", name="Keep")
    _seed_recipe(client, id="drop", name="Drop")
    ids = {r["recipe"]["id"] for r in _recommend(client, exclude_ids=["drop"])}
    assert ids == {"keep"}


# ── Ability matching (#59 integration) ────────────────────────────────────────

def test_deadline_stress_favours_simpler_recipes(client):
    """Under crunch, an easy recipe should out-rank an ambitious one for a
    beginner — the engine consumes the derived #59 ability profile."""
    _seed_user(client, cooking_ability="beginner", max_time_minutes=999)
    _seed_recipe(
        client, id="easy", name="Beans on Toast", prep_minutes=5,
        cuisine="british", flavor_profile=[], techniques=[], allergens=[],
        ingredients=[{"name": "beans"}, {"name": "bread"}],
    )
    _seed_recipe(
        client, id="hard", name="Beef Wellington", prep_minutes=120,
        cuisine="french", flavor_profile=["rich"],
        techniques=["sear", "laminate", "roast", "rest"], allergens=[],
        ingredients=[{"name": "beef"}],
    )
    ranked = [r["recipe"]["id"] for r in _recommend(client, deadline_stress=1.0, n=2)]
    assert ranked[0] == "easy"


# ── Taste embedding path (#60 integration) ────────────────────────────────────

def test_taste_path_used_after_positive_interaction(client):
    """A swipe_right recomputes the user's taste embedding, after which the
    candidate retrieval orders by embedding similarity rather than at random."""
    _seed_user(client, max_time_minutes=999)
    _seed_recipe(client, id="liked", name="Liked")
    _seed_recipe(client, id="other", name="Other")

    resp = client.post("/interactions",
                       json={"user_id": "u1", "recipe_id": "liked", "action": "swipe_right"})
    assert resp.status_code == 200

    results = _recommend(client)
    ids = {r["recipe"]["id"] for r in results}
    assert "liked" in ids and "other" in ids
    # taste_similarity now reflects a real embedding comparison (not the 0.5
    # neutral default) for at least one candidate.
    assert any(r["breakdown"]["taste_similarity"] != 0.5 for r in results)


# ── Collaborative + trending signals ──────────────────────────────────────────

def test_collaborative_and_trending_feed_into_breakdown(client):
    _seed_user(client, max_time_minutes=999)
    _seed_recipe(client, id="liked", name="Liked")
    _seed_recipe(client, id="colike", name="Co-liked")
    _seed_recipe(client, id="hot", name="Trending")

    # User has liked "liked"; co_likes link it to "colike"; "hot" is trending.
    client.fake_session.store["interactions"].append(
        {"user_id": "u1", "recipe_id": "liked", "action": "swipe_right"})
    client.fake_session.store["co_likes"].append(
        {"recipe_a": "liked", "recipe_b": "colike", "weight": 5.0})
    client.fake_session.store["trending"]["hot"] = 9.0

    by_id = {r["recipe"]["id"]: r for r in _recommend(client)}
    assert by_id["colike"]["breakdown"]["collaborative"] > 0
    assert by_id["hot"]["breakdown"]["trending"] > by_id["colike"]["breakdown"]["trending"]


# ── Validation ────────────────────────────────────────────────────────────────

def test_recommend_validates_n_bounds(client):
    _seed_user(client)
    assert client.post("/recommend", json={"user_id": "u1", "n": 0}).status_code == 422
    assert client.post("/recommend", json={"user_id": "u1", "n": 101}).status_code == 422


def test_recommend_validates_deadline_stress_bounds(client):
    _seed_user(client)
    assert client.post("/recommend", json={"user_id": "u1", "deadline_stress": 1.5}).status_code == 422
    assert client.post("/recommend", json={"user_id": "u1", "deadline_stress": -0.1}).status_code == 422


def test_recommend_validates_exploration_controls(client):
    _seed_user(client)
    assert client.post("/recommend", json={"user_id": "u1", "exploration_rate": 1.5}).status_code == 422
    assert client.post("/recommend", json={"user_id": "u1", "temperature": -0.1}).status_code == 422
    assert client.post("/recommend", json={"user_id": "u1", "temperature": 2.5}).status_code == 422


def test_recommend_requires_user_id(client):
    assert client.post("/recommend", json={}).status_code == 422


# ── Auth boundary ─────────────────────────────────────────────────────────────

def test_recommend_rejects_missing_api_key(client):
    resp = client.post("/recommend", json={"user_id": "u1"},
                       headers={"X-Deadline-Food-API-Key": ""})
    assert resp.status_code == 401
