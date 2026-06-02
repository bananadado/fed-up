"""Tests for the heuristic recipe difficulty scorer."""

from app.difficulty import score_difficulty


def test_score_is_clamped_between_zero_and_one():
    huge = {
        "techniques": ["deep fry", "temper", "debone", "julienne"],
        "ingredients": [{"name": f"i{i}"} for i in range(40)],
        "prep_minutes": 240,
        "instructions": [f"step {i}" for i in range(20)],
        "equipment": ["wok", "blender", "mandoline", "pressure cooker"],
    }
    assert score_difficulty(huge) == 1.0

    trivial = {"techniques": [], "ingredients": [], "prep_minutes": 0, "instructions": []}
    assert 0.0 <= score_difficulty(trivial) <= 1.0


def test_more_techniques_increase_difficulty():
    simple = {"techniques": ["boil"], "ingredients": [{"name": "pasta"}], "prep_minutes": 10}
    complex_ = {"techniques": ["deep fry", "reduce sauce"], "ingredients": [{"name": "pasta"}], "prep_minutes": 10}
    assert score_difficulty(complex_) > score_difficulty(simple)


def test_uncommon_equipment_increases_difficulty():
    without = {"techniques": ["chop"], "equipment": ["pan"], "prep_minutes": 15}
    with_ = {"techniques": ["chop"], "equipment": ["mandoline"], "prep_minutes": 15}
    assert score_difficulty(with_) > score_difficulty(without)


def test_more_ingredients_increase_difficulty():
    few = {"ingredients": [{"name": "a"}], "prep_minutes": 10}
    many = {"ingredients": [{"name": f"i{i}"} for i in range(10)], "prep_minutes": 10}
    assert score_difficulty(many) > score_difficulty(few)


def test_longer_prep_increases_difficulty():
    quick = {"prep_minutes": 5, "ingredients": [{"name": "a"}]}
    slow = {"prep_minutes": 55, "ingredients": [{"name": "a"}]}
    assert score_difficulty(slow) > score_difficulty(quick)


def test_fallback_meal_type_reduces_difficulty():
    base = {"techniques": ["bake"], "ingredients": [{"name": f"i{i}"} for i in range(5)], "prep_minutes": 20}
    cook = score_difficulty({**base, "meal_type": "cook"})
    fallback = score_difficulty({**base, "meal_type": "fallback"})
    assert fallback < cook


def test_unknown_technique_uses_default_weight():
    known = {"techniques": ["boil"], "prep_minutes": 0, "ingredients": []}
    unknown = {"techniques": ["sous vide wizardry"], "prep_minutes": 0, "ingredients": []}
    # default weight (0.2) is higher than boil (0.05)
    assert score_difficulty(unknown) > score_difficulty(known)


def test_case_insensitive_technique_matching():
    lower = score_difficulty({"techniques": ["deep fry"], "ingredients": [], "prep_minutes": 0})
    upper = score_difficulty({"techniques": ["DEEP FRY"], "ingredients": [], "prep_minutes": 0})
    assert lower == upper


def test_legacy_keys_steps_and_type_are_supported():
    recipe = {"steps": [f"s{i}" for i in range(6)], "type": "fallback", "ingredients": [], "prep_minutes": 0}
    # steps>5 adds 0.15, fallback subtracts 0.3 -> clamped to 0
    assert score_difficulty(recipe) == 0.0
