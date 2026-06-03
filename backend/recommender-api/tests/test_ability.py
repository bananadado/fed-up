"""Tests for the user ability/preference profile derivation (issue #59)."""

import pytest

from app.ability import (
    DIMENSIONS,
    behavioural_profile,
    derive_ability_profile,
    onboarding_priors,
    recipe_targets,
)


def _recipe(**kw):
    base = {
        "difficulty": 0.5,
        "techniques": [],
        "prep_minutes": 0,
        "flavor_profile": [],
        "dietary_tags": [],
        "suitability_tags": [],
        "cuisine": None,
    }
    base.update(kw)
    return base


# ── onboarding priors ────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "ability,expected",
    [("beginner", 0.25), ("basic", 0.45), ("intermediate", 0.65), ("advanced", 0.85)],
)
def test_onboarding_skill_maps_to_dimensions(ability, expected):
    priors = onboarding_priors({"cooking_ability": ability})
    assert priors["knife_skill"] == expected
    assert priors["complexity_tolerance"] == expected


def test_onboarding_unknown_ability_defaults_to_basic():
    assert onboarding_priors({"cooking_ability": "wizard"})["knife_skill"] == 0.45
    assert onboarding_priors({})["knife_skill"] == 0.45


def test_onboarding_time_tolerance_scales_with_max_time():
    assert onboarding_priors({"max_time_minutes": 45})["time_tolerance"] == 0.5
    assert onboarding_priors({"max_time_minutes": 200})["time_tolerance"] == 1.0
    # Missing value falls back to the 30-minute onboarding default.
    assert onboarding_priors({})["time_tolerance"] == pytest.approx(1 / 3)


def test_onboarding_spice_and_health_from_likes_and_diet():
    p = onboarding_priors({"likes": ["spicy"], "dietary_tags": ["high-protein"]})
    assert p["spice_preference"] == 0.7
    assert p["healthy_bias"] == 0.65


def test_onboarding_priors_all_in_range():
    p = onboarding_priors({"cooking_ability": "advanced", "max_time_minutes": 500, "likes": ["a"] * 50})
    assert all(0.0 <= p[d] <= 1.0 for d in DIMENSIONS)


# ── recipe targets ───────────────────────────────────────────────────────────

def test_recipe_targets_difficulty_drives_skill_dimensions():
    t = recipe_targets(_recipe(difficulty=0.9))
    assert t["knife_skill"] == 0.9
    assert t["complexity_tolerance"] == 0.9


def test_recipe_targets_spicy_flavour():
    assert recipe_targets(_recipe(flavor_profile=["spicy"]))["spice_preference"] == 0.85
    assert recipe_targets(_recipe(flavor_profile=["sweet"]))["spice_preference"] == 0.35


def test_recipe_targets_exotic_cuisine_raises_adventurousness():
    assert recipe_targets(_recipe(cuisine="Thai"))["adventurousness"] == 0.7
    assert recipe_targets(_recipe(cuisine="British"))["adventurousness"] == 0.4


def test_recipe_targets_missing_difficulty_defaults():
    assert recipe_targets({"techniques": []})["knife_skill"] == 0.5


# ── behavioural profile ──────────────────────────────────────────────────────

def test_behavioural_none_without_signal():
    assert behavioural_profile([], [], [], []) is None


def test_liking_high_difficulty_raises_complexity():
    prof = behavioural_profile([_recipe(difficulty=0.9)], [1.0], [], [])
    assert prof["complexity_tolerance"] == pytest.approx(0.9)


def test_disliking_spicy_lowers_spice_preference():
    prof = behavioural_profile([], [], [_recipe(flavor_profile=["spicy"])], [1.0])
    # 0.5 - (0.85 - 0.5) = 0.15
    assert prof["spice_preference"] == pytest.approx(0.15)


def test_like_and_dislike_combine_symmetrically():
    prof = behavioural_profile(
        [_recipe(difficulty=0.8)], [1.0], [_recipe(difficulty=0.2)], [1.0]
    )
    # 0.5 + (0.8-0.5) - (0.2-0.5) = 1.1 -> clamped
    assert prof["complexity_tolerance"] == 1.0


# ── blended profile ──────────────────────────────────────────────────────────

def test_no_interactions_returns_priors():
    user = {"cooking_ability": "intermediate"}
    profile = derive_ability_profile(user)
    assert profile["knife_skill"] == 0.65


def test_behaviour_pulls_profile_away_from_priors():
    user = {"cooking_ability": "beginner"}  # complexity prior 0.25
    profile = derive_ability_profile(user, liked=[_recipe(difficulty=0.9)], liked_weights=[1.0])
    assert 0.25 < profile["complexity_tolerance"] < 0.9


def test_more_interactions_increase_behavioural_weight():
    user = {"cooking_ability": "beginner"}
    one = derive_ability_profile(user, liked=[_recipe(difficulty=0.9)], liked_weights=[1.0])
    many = derive_ability_profile(
        user, liked=[_recipe(difficulty=0.9)] * 10, liked_weights=[1.0] * 10
    )
    # With more evidence the profile sits closer to the behavioural target (0.9).
    assert many["complexity_tolerance"] > one["complexity_tolerance"]


def test_profile_always_has_all_dimensions_in_range():
    profile = derive_ability_profile(
        {"cooking_ability": "advanced"},
        liked=[_recipe(difficulty=1.0, flavor_profile=["spicy"], cuisine="Ethiopian")],
        liked_weights=[3.0],
        disliked=[_recipe(difficulty=0.0)],
        disliked_weights=[1.0],
    )
    assert set(profile) == set(DIMENSIONS)
    assert all(0.0 <= profile[d] <= 1.0 for d in DIMENSIONS)
