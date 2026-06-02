"""Tests for recipe embedding text synthesis (issue #60).

Recipes are embedded from a synthesized natural-language description built from
time, ingredients, cooking techniques, cuisine and flavour.
"""

from app.embeddings import synthesize_recipe_text, time_descriptor

from .conftest import sample_recipe


def test_synthesis_includes_core_signals():
    text = synthesize_recipe_text(sample_recipe())
    assert "Spicy Thai Basil Chicken" in text
    assert "Cuisine: Thai." in text
    assert "Techniques: stir fry, reduce sauce." in text
    assert "chicken thigh" in text and "thai basil" in text
    assert "Flavors: spicy, umami." in text
    assert "Equipment: wok." in text


def test_synthesis_includes_time_descriptor_and_minutes():
    text = synthesize_recipe_text(sample_recipe(prep_minutes=25))
    assert "Moderate effort, 25 minutes prep." in text


def test_synthesis_omits_empty_sections():
    text = synthesize_recipe_text(
        {"name": "Plain toast", "meal_type": "fallback", "meal_slots": [], "ingredients": [], "prep_minutes": 0}
    )
    assert "Cuisine:" not in text
    assert "Techniques:" not in text
    assert "Ingredients:" not in text
    assert "minutes prep" not in text
    assert text.startswith("Plain toast")


def test_synthesis_handles_string_ingredients():
    text = synthesize_recipe_text(
        {"name": "Salad", "ingredients": ["lettuce", "tomato"], "meal_slots": [], "prep_minutes": 5}
    )
    assert "Ingredients: lettuce, tomato." in text


def test_synthesis_filters_blank_ingredient_names():
    text = synthesize_recipe_text(
        {"name": "X", "ingredients": [{"name": ""}, {"name": "egg"}], "meal_slots": [], "prep_minutes": 0}
    )
    assert "Ingredients: egg." in text


def test_meal_type_is_described_in_words():
    text = synthesize_recipe_text(sample_recipe(meal_type="prep_base"))
    assert "Batch prep base for the week." in text


def test_time_descriptor_buckets():
    assert time_descriptor(0) == "No-cook"
    assert time_descriptor(8) == "Very quick"
    assert time_descriptor(15) == "Quick weeknight"
    assert time_descriptor(30) == "Moderate effort"
    assert time_descriptor(60) == "Involved"
    assert time_descriptor(120) == "Cooking project"


def test_time_descriptor_is_monotonic_across_buckets():
    samples = [0, 10, 20, 40, 75, 200]
    labels = [time_descriptor(m) for m in samples]
    assert len(set(labels)) == len(labels)


def test_synthesis_is_deterministic():
    r = sample_recipe()
    assert synthesize_recipe_text(r) == synthesize_recipe_text(r)
