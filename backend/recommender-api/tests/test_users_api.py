"""Endpoint tests for user profiles and ability derivation (issue #59)."""

from app.ability import DIMENSIONS
from app.jobs import recompute_user_profile

from .conftest import FakeSession, sample_recipe, sample_user


def test_create_and_get_user(client):
    assert client.post("/users", json=sample_user()).status_code == 200
    resp = client.get("/users/u1")
    assert resp.status_code == 200
    assert resp.json()["university"] == "Imperial"


def test_get_user_404(client):
    assert client.get("/users/ghost").status_code == 404


def test_ability_defaults_to_neutral_for_new_user(client):
    client.post("/users", json=sample_user())
    resp = client.get("/users/u1/ability")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == set(DIMENSIONS)
    assert all(v == 0.5 for v in body.values())


def test_ability_endpoint_404(client):
    assert client.get("/users/ghost/ability").status_code == 404


def test_positive_interaction_updates_profile(client):
    client.post("/users", json=sample_user(id="u1", cooking_ability="beginner"))
    client.post("/recipes", json=sample_recipe(id="r1", difficulty=None, prep_minutes=60,
                                               techniques=["deep fry", "reduce sauce"], flavor_profile=["spicy"]))

    resp = client.post("/interactions", json={"user_id": "u1", "recipe_id": "r1", "action": "cook"})
    assert resp.status_code == 200

    user = client.fake_session.store["users"]["u1"]
    # Profile columns + taste embedding were written.
    assert "complexity_tolerance" in user
    assert user["taste_embedding"] is not None

    ability = client.get("/users/u1/ability").json()
    # A beginner cooking a hard, spicy recipe nudges these up from neutral priors.
    assert ability["complexity_tolerance"] > 0.25
    assert ability["spice_preference"] > 0.5


def test_negative_interaction_also_recomputes_profile(client):
    client.post("/users", json=sample_user(id="u1"))
    client.post("/recipes", json=sample_recipe(id="r1", flavor_profile=["spicy"]))
    client.post("/interactions", json={"user_id": "u1", "recipe_id": "r1", "action": "swipe_left"})

    ability = client.get("/users/u1/ability").json()
    # Disliking a spicy recipe lowers spice preference below the neutral prior.
    assert ability["spice_preference"] < 0.5


def test_neutral_action_does_not_require_profile(client):
    client.post("/users", json=sample_user(id="u1"))
    client.post("/recipes", json=sample_recipe(id="r1"))
    resp = client.post("/interactions", json={"user_id": "u1", "recipe_id": "r1", "action": "view"})
    assert resp.status_code == 200
    # "view" is neither positive nor negative -> profile untouched.
    assert "complexity_tolerance" not in client.fake_session.store["users"]["u1"]


def test_recompute_profile_endpoint_404(client):
    assert client.post("/users/ghost/recompute-profile").status_code == 404


def test_recompute_profile_endpoint_ok(client):
    client.post("/users", json=sample_user(id="u1"))
    client.post("/recipes", json=sample_recipe(id="r1"))
    client.post("/interactions", json={"user_id": "u1", "recipe_id": "r1", "action": "save"})
    resp = client.post("/users/u1/recompute-profile")
    assert resp.status_code == 200
    assert resp.json()["user_id"] == "u1"


async def test_taste_embedding_likes_minus_dislikes(store):
    """Liked recipes pull the embedding in, disliked recipes push it away."""
    store["users"]["u1"] = sample_user(id="u1")
    store["recipes"]["liked"] = {**sample_recipe(id="liked"), "embedding": [1.0] + [0.0] * 383}
    store["recipes"]["hated"] = {**sample_recipe(id="hated"), "embedding": [0.0, 1.0] + [0.0] * 382}
    store["interactions"].append({"user_id": "u1", "recipe_id": "liked", "action": "cook"})
    store["interactions"].append({"user_id": "u1", "recipe_id": "hated", "action": "swipe_left"})

    session = FakeSession(store)
    assert await recompute_user_profile(session, "u1") is True

    taste = store["users"]["u1"]["taste_embedding"]
    assert taste is not None
    # Stored as a vector literal string; the liked axis should dominate the
    # disliked axis (which is pushed negative).
    vec = [float(x) for x in taste.strip("[]").split(",")]
    assert vec[0] > 0  # liked direction
    assert vec[1] < 0  # disliked direction pushed away
    assert abs(sum(v * v for v in vec) ** 0.5 - 1.0) < 1e-6  # normalised


async def test_recompute_profile_missing_user(store):
    session = FakeSession(store)
    assert await recompute_user_profile(session, "nobody") is False
