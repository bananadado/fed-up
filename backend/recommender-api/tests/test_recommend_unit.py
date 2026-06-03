"""Unit tests for the reactive recommendation engine internals (issue #61).

These exercise the pure ranking, ability-matching and exploration helpers in
``app.recommend`` directly — no DB, no FastAPI — so the scoring logic is pinned
down precisely. The endpoint-level integration is covered in
``test_recommend_api.py``.
"""

import random

from app import recommend as rec
from app.ability import DIMENSIONS


# ── _ability_profile ──────────────────────────────────────────────────────────

def test_ability_profile_uses_derived_dimensions_when_present():
    user = {d: 0.7 for d in DIMENSIONS}
    user["cooking_ability"] = "beginner"  # should be ignored when dims present
    profile = rec._ability_profile(user)
    assert profile == {d: 0.7 for d in DIMENSIONS}


def test_ability_profile_falls_back_to_cooking_ability_scalar():
    profile = rec._ability_profile({"cooking_ability": "advanced"})
    assert profile == {d: rec.ABILITY_MAP["advanced"] for d in DIMENSIONS}


def test_ability_profile_unknown_ability_defaults_to_basic_scalar():
    profile = rec._ability_profile({"cooking_ability": "wizard"})
    assert profile == {d: 0.45 for d in DIMENSIONS}


# ── _ability_match ────────────────────────────────────────────────────────────

def _profile(value: float) -> dict[str, float]:
    return {d: value for d in DIMENSIONS}


def test_ability_match_perfect_when_recipe_matches_profile():
    recipe = {"difficulty": 0.5, "techniques": ["a", "b"], "prep_minutes": 45,
              "flavor_profile": [], "cuisine": "italian"}
    # A capable, adventurous-enough profile that meets every demand.
    profile = {
        "knife_skill": 0.5, "multi_tasking": 0.5, "time_tolerance": 0.5,
        "complexity_tolerance": 0.5, "spice_preference": 0.35,
        "adventurousness": 0.4, "healthy_bias": 0.3,
    }
    assert rec._ability_match(profile, recipe) == 1.0


def test_ability_match_capability_dims_are_one_sided():
    """A user more capable than the recipe requires is not penalised."""
    easy_recipe = {"difficulty": 0.1, "techniques": [], "prep_minutes": 5,
                   "flavor_profile": [], "cuisine": "british"}
    # High capability, but preferences matched to the recipe so only the
    # one-sided capability dims are under test.
    expert = {
        "knife_skill": 0.9, "multi_tasking": 0.9, "time_tolerance": 0.9,
        "complexity_tolerance": 0.9,
        "spice_preference": 0.35, "adventurousness": 0.4, "healthy_bias": 0.3,
    }
    # Being over-capable contributes zero penalty → perfect match.
    assert rec._ability_match(expert, easy_recipe) == 1.0


def test_ability_match_penalises_overreaching_recipe():
    hard = {"difficulty": 0.95, "techniques": ["a", "b", "c", "d"], "prep_minutes": 90,
            "flavor_profile": ["spicy"], "cuisine": "ethiopian"}
    beginner = _profile(0.2)
    assert rec._ability_match(beginner, hard) < 0.5


def test_ability_match_stress_sharpens_overreach_penalty():
    hard = {"difficulty": 0.95, "techniques": ["a", "b", "c", "d"], "prep_minutes": 90,
            "flavor_profile": [], "cuisine": "british"}
    beginner = _profile(0.2)
    calm = rec._ability_match(beginner, hard, stress=0.0)
    crunch = rec._ability_match(beginner, hard, stress=1.0)
    assert crunch < calm


def test_ability_match_never_negative():
    impossible = {"difficulty": 1.0, "techniques": ["a", "b", "c", "d", "e"],
                  "prep_minutes": 120, "flavor_profile": ["spicy"], "cuisine": "thai"}
    assert rec._ability_match(_profile(0.0), impossible, stress=1.0) >= 0.0


# ── _cosine_sim / _as_vector ──────────────────────────────────────────────────

def test_cosine_sim_identical_vectors_is_one():
    assert rec._cosine_sim([1.0, 0.0], [1.0, 0.0]) == 1.0


def test_cosine_sim_opposite_vectors_is_zero():
    assert rec._cosine_sim([1.0, 0.0], [-1.0, 0.0]) == 0.0


def test_cosine_sim_parses_string_encoded_vectors():
    # pgvector values arrive as ``str(list)`` in places — must still compute.
    assert rec._cosine_sim("[1.0, 0.0]", "[1.0, 0.0]") == 1.0


def test_cosine_sim_garbage_string_is_neutral():
    assert rec._cosine_sim("not-a-vector", [1.0, 0.0]) == 0.5


def test_cosine_sim_none_is_neutral():
    assert rec._cosine_sim(None, [1.0, 0.0]) == 0.5


# ── _taste_similarity ─────────────────────────────────────────────────────────

def test_taste_similarity_neutral_without_embeddings():
    assert rec._taste_similarity({"taste_embedding": None}, {"embedding": [1.0]}) == 0.5
    assert rec._taste_similarity({"taste_embedding": [1.0]}, {"embedding": None}) == 0.5


def test_taste_similarity_uses_cosine_when_both_present():
    assert rec._taste_similarity({"taste_embedding": [1.0, 0.0]}, {"embedding": [1.0, 0.0]}) == 1.0


# ── _budget_score ─────────────────────────────────────────────────────────────

def test_budget_score_tiers():
    user = {"budget_pence": 7000}  # daily = 1000
    assert rec._budget_score({"price_pence": 200}, user) == 1.0
    assert rec._budget_score({"price_pence": 400}, user) == 0.7
    assert rec._budget_score({"price_pence": 900}, user) == 0.4
    assert rec._budget_score({"price_pence": 2000}, user) == 0.1


# ── _health_score ─────────────────────────────────────────────────────────────

def test_health_score_rewards_tag_overlap_with_likes():
    recipe = {"suitability_tags": ["high-protein"], "dietary_tags": ["vegan"]}
    base = rec._health_score(recipe, {"likes": []})
    overlap = rec._health_score(recipe, {"likes": ["high-protein", "vegan"]})
    assert overlap > base
    assert overlap <= 1.0


# ── _blend_weights ────────────────────────────────────────────────────────────

def test_blend_weights_unchanged_without_stress():
    assert rec._blend_weights(0.0) == rec.RANKING_WEIGHTS


def test_blend_weights_normalised_under_stress():
    blended = rec._blend_weights(1.0)
    assert abs(sum(blended.values()) - 1.0) < 1e-9


def test_blend_weights_shifts_toward_ability_and_budget_under_stress():
    blended = rec._blend_weights(1.0)
    assert blended["ability_match"] > rec.RANKING_WEIGHTS["ability_match"]
    assert blended["budget_fit"] > rec.RANKING_WEIGHTS["budget_fit"]
    assert blended["novelty"] < rec.RANKING_WEIGHTS["novelty"]


# ── _apply_exploration ────────────────────────────────────────────────────────

def _candidates(n: int) -> list[dict]:
    # Descending scores 1.0, 0.9, ... so order is unambiguous.
    return [{"recipe": {"id": f"r{i}"}, "score": 1.0 - i * 0.01, "breakdown": {}} for i in range(n)]


def test_apply_exploration_zero_temperature_is_pure_ranking():
    deck = rec._apply_exploration(_candidates(30), n=10, rate=0.2, temperature=0.0)
    assert [c["recipe"]["id"] for c in deck] == [f"r{i}" for i in range(10)]


def test_apply_exploration_returns_at_most_n():
    deck = rec._apply_exploration(_candidates(50), n=10, rate=0.2, temperature=0.0)
    assert len(deck) == 10


def test_apply_exploration_returns_all_when_fewer_than_n():
    deck = rec._apply_exploration(_candidates(3), n=10, rate=0.2, temperature=0.5)
    assert len(deck) == 3


def test_apply_exploration_empty_input():
    assert rec._apply_exploration([], n=10, rate=0.2, temperature=0.5) == []


def test_apply_exploration_surfaces_wildcards_in_returned_deck():
    """With temperature on, the tail slots should include candidates that would
    never appear if exploration only reshuffled positions past ``n``."""
    rng = random.Random(1234)
    candidates = _candidates(200)
    deck = rec._apply_exploration(candidates, n=20, rate=0.2, temperature=0.5, rng=rng)
    ids = {c["recipe"]["id"] for c in deck}
    # Safe portion (top 16) is always present...
    assert {f"r{i}" for i in range(16)}.issubset(ids)
    # ...and at least one wildcard from beyond the original top-20 surfaced.
    assert any(int(c["recipe"]["id"][1:]) >= 20 for c in deck)


def test_apply_exploration_keeps_safe_fraction():
    rng = random.Random(7)
    deck = rec._apply_exploration(_candidates(100), n=10, rate=0.2, temperature=0.5, rng=rng)
    # round(10 * 0.8) = 8 safe picks, in strict score order.
    assert [c["recipe"]["id"] for c in deck[:8]] == [f"r{i}" for i in range(8)]


def test_apply_exploration_strips_internal_explore_score():
    deck = rec._apply_exploration(_candidates(50), n=10, rate=0.2, temperature=0.5,
                                  rng=random.Random(0))
    assert all("explore_score" not in c for c in deck)
