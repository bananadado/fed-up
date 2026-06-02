#!/usr/bin/env python3
"""Seed the recommender DB with meals from both prototype data models.

Run after the stack is up:
  docker compose exec api python /app/scripts/seed.py
"""

import asyncio
import json
import os
import sys

import httpx

API = os.environ.get("API_URL", "http://localhost:8000")
API_KEY = os.environ.get("RECOMMENDER_API_KEY", "")

PROTOTYPE_MEALS = [
    {
        "id": "m1",
        "name": "Roast veg & chickpea traybake",
        "meal_type": "cook",
        "meal_slots": ["dinner"],
        "price_pence": 285,
        "prep_minutes": 20,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["gluten"],
        "suitability_tags": ["batch-friendly"],
        "ingredients": [
            {"name": "chickpeas", "quantity": 120, "unit": "g"},
            {"name": "peppers", "quantity": 100, "unit": "g"},
            {"name": "courgette", "quantity": 100, "unit": "g"},
            {"name": "couscous", "quantity": 75, "unit": "g"},
        ],
        "instructions": [
            "Chop the vegetables and spread them on a tray.",
            "Add chickpeas, oil and seasoning, then roast until tender.",
            "Serve with couscous and save leftovers for wraps.",
        ],
        "cuisine": "Mediterranean",
        "flavor_profile": ["savory", "roasted", "herby"],
        "techniques": ["roast", "chop"],
        "equipment": ["oven", "baking tray"],
        "nutrition": {"calories": 510, "protein": 19, "carbs": 74, "fat": 14},
        "source": "Budget Bytes",
        "note": "Makes two remix portions",
    },
    {
        "id": "m2",
        "name": "Traybake hummus wrap",
        "meal_type": "remix",
        "meal_slots": ["lunch", "dinner"],
        "price_pence": 195,
        "prep_minutes": 4,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["gluten", "sesame"],
        "suitability_tags": ["quick", "no cooking"],
        "ingredients": [
            {"name": "chickpeas", "quantity": 80, "unit": "g"},
            {"name": "wrap", "quantity": 1, "unit": "wrap"},
            {"name": "hummus", "quantity": 40, "unit": "g"},
            {"name": "salad", "quantity": 50, "unit": "g"},
        ],
        "instructions": [
            "Warm the wrap if you have time.",
            "Add hummus, leftover traybake and salad.",
            "Roll tightly and pack with a napkin.",
        ],
        "cuisine": "Mediterranean",
        "flavor_profile": ["creamy", "savory", "fresh"],
        "techniques": [],
        "equipment": [],
        "source": "From your prep",
        "note": "Uses Monday's traybake",
    },
    {
        "id": "m3",
        "name": "Ginger tofu noodles",
        "meal_type": "cook",
        "meal_slots": ["dinner"],
        "price_pence": 320,
        "prep_minutes": 14,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["soy", "gluten"],
        "suitability_tags": ["high protein", "one pan"],
        "ingredients": [
            {"name": "tofu", "quantity": 150, "unit": "g"},
            {"name": "noodles", "quantity": 100, "unit": "g"},
            {"name": "soy sauce", "quantity": 15, "unit": "ml"},
            {"name": "broccoli", "quantity": 100, "unit": "g"},
        ],
        "instructions": [
            "Boil or soak the noodles according to the pack.",
            "Fry tofu with ginger until browned.",
            "Add broccoli, soy sauce and noodles, then toss together.",
        ],
        "cuisine": "East Asian",
        "flavor_profile": ["savory", "gingery", "umami"],
        "techniques": ["stir fry", "boil"],
        "equipment": ["wok"],
        "source": "BBC Good Food",
        "note": "One pan",
    },
    {
        "id": "m4",
        "name": "Lentil pesto pasta pot",
        "meal_type": "cook",
        "meal_slots": ["lunch", "dinner"],
        "price_pence": 265,
        "prep_minutes": 12,
        "dietary_tags": ["vegetarian"],
        "allergens": ["gluten", "milk", "tree nuts"],
        "suitability_tags": ["high protein", "filling"],
        "ingredients": [
            {"name": "lentils", "quantity": 120, "unit": "g"},
            {"name": "pasta", "quantity": 90, "unit": "g"},
            {"name": "pesto", "quantity": 30, "unit": "g"},
            {"name": "spinach", "quantity": 50, "unit": "g"},
        ],
        "instructions": [
            "Cook pasta until just tender.",
            "Stir through lentils, pesto and spinach.",
            "Loosen with a splash of pasta water and pack warm.",
        ],
        "cuisine": "Italian",
        "flavor_profile": ["herby", "savory", "nutty"],
        "techniques": ["boil"],
        "equipment": ["pot"],
        "source": "Student Eats",
        "note": "Good before an evening study session",
    },
    {
        "id": "m5",
        "name": "Bean & salad wrap",
        "meal_type": "fallback",
        "meal_slots": ["lunch", "dinner"],
        "price_pence": 410,
        "prep_minutes": 2,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["gluten"],
        "suitability_tags": ["near library", "no cooking"],
        "ingredients": [
            {"name": "beans", "quantity": 120, "unit": "g"},
            {"name": "salad", "quantity": 50, "unit": "g"},
            {"name": "wrap", "quantity": 1, "unit": "wrap"},
        ],
        "instructions": [
            "Pick up from the cafe chiller.",
            "Check the label against your allergy settings.",
            "Eat cold or ask for it toasted if there is time.",
        ],
        "cuisine": None,
        "flavor_profile": ["fresh", "mild"],
        "techniques": [],
        "equipment": [],
        "source": "Library Cafe",
        "note": "2 min collection - illustrative price",
    },
    {
        "id": "m6",
        "name": "Falafel grain bowl",
        "meal_type": "fallback",
        "meal_slots": ["lunch", "dinner"],
        "price_pence": 455,
        "prep_minutes": 4,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["sesame", "gluten"],
        "suitability_tags": ["near campus", "no cooking"],
        "ingredients": [
            {"name": "falafel", "quantity": 120, "unit": "g"},
            {"name": "grains", "quantity": 150, "unit": "g"},
            {"name": "salad", "quantity": 60, "unit": "g"},
        ],
        "instructions": [
            "Order the standard bowl.",
            "Choose the lighter dressing if you want a lower-fat option.",
            "Add water or fruit if this is your main meal.",
        ],
        "cuisine": "Middle Eastern",
        "flavor_profile": ["savory", "herby", "earthy"],
        "techniques": [],
        "equipment": [],
        "source": "Campus Food Hall",
        "note": "4 min walk - illustrative price",
    },
    {
        "id": "m7",
        "name": "Chicken rice bowl",
        "meal_type": "fallback",
        "meal_slots": ["lunch", "dinner"],
        "price_pence": 470,
        "prep_minutes": 4,
        "dietary_tags": [],
        "allergens": ["soy"],
        "suitability_tags": ["high protein", "near campus", "no cooking"],
        "ingredients": [
            {"name": "chicken", "quantity": 140, "unit": "g"},
            {"name": "rice", "quantity": 180, "unit": "g"},
            {"name": "vegetables", "quantity": 100, "unit": "g"},
        ],
        "instructions": [
            "Pick up from the hot counter.",
            "Ask for sauce on the side if available.",
            "Check the daily allergen board before buying.",
        ],
        "cuisine": "East Asian",
        "flavor_profile": ["savory", "mild"],
        "techniques": [],
        "equipment": [],
        "source": "Campus Food Hall",
        "note": "4 min walk - illustrative price",
    },
    {
        "id": "m8",
        "name": "Microwave lentil dhal & rice",
        "meal_type": "fallback",
        "meal_slots": ["dinner"],
        "price_pence": 325,
        "prep_minutes": 3,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": [],
        "suitability_tags": ["near halls", "no cooking", "microwave"],
        "ingredients": [
            {"name": "lentils", "quantity": 180, "unit": "g"},
            {"name": "rice", "quantity": 180, "unit": "g"},
        ],
        "instructions": [
            "Microwave the rice and dhal packs.",
            "Stir halfway through heating.",
            "Serve in one bowl and add spinach if you have it.",
        ],
        "cuisine": "South Asian",
        "flavor_profile": ["warming", "spiced", "earthy"],
        "techniques": ["microwave"],
        "equipment": ["microwave"],
        "source": "Local supermarket",
        "note": "3 min heat-up - illustrative price",
    },
    {
        "id": "m9",
        "name": "Overnight oat jar",
        "meal_type": "cook",
        "meal_slots": ["breakfast"],
        "price_pence": 115,
        "prep_minutes": 5,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["gluten"],
        "suitability_tags": ["breakfast", "no cooking", "batch prep"],
        "ingredients": [
            {"name": "oats", "quantity": 50, "unit": "g"},
            {"name": "oat milk", "quantity": 150, "unit": "ml"},
            {"name": "berries", "quantity": 80, "unit": "g"},
            {"name": "chia seeds", "quantity": 10, "unit": "g"},
        ],
        "instructions": [
            "Mix oats, oat milk and chia seeds in a jar.",
            "Refrigerate overnight.",
            "Top with berries before leaving.",
        ],
        "cuisine": None,
        "flavor_profile": ["sweet", "fruity", "creamy"],
        "techniques": [],
        "equipment": ["jar", "fridge"],
        "source": "Student Eats",
        "note": "Make the night before",
    },
    {
        "id": "m10",
        "name": "Scrambled egg toast",
        "meal_type": "cook",
        "meal_slots": ["breakfast"],
        "price_pence": 135,
        "prep_minutes": 8,
        "dietary_tags": ["vegetarian"],
        "allergens": ["eggs", "gluten"],
        "suitability_tags": ["breakfast", "hot meal", "high protein"],
        "ingredients": [
            {"name": "egg", "quantity": 2, "unit": "item"},
            {"name": "bread", "quantity": 2, "unit": "slice"},
            {"name": "spinach", "quantity": 40, "unit": "g"},
        ],
        "instructions": [
            "Toast the bread.",
            "Scramble eggs in a pan or microwave-safe bowl.",
            "Add spinach at the end and serve on toast.",
        ],
        "cuisine": "British",
        "flavor_profile": ["savory", "buttery", "mild"],
        "techniques": ["scramble"],
        "equipment": ["pan", "toaster"],
        "source": "My staples",
        "note": "High-protein breakfast",
    },
    {
        "id": "m11",
        "name": "Banana oat breakfast pot",
        "meal_type": "fallback",
        "meal_slots": ["breakfast"],
        "price_pence": 225,
        "prep_minutes": 2,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["gluten"],
        "suitability_tags": ["breakfast", "near campus", "no cooking"],
        "ingredients": [
            {"name": "oats", "quantity": 45, "unit": "g"},
            {"name": "banana", "quantity": 1, "unit": "serving"},
            {"name": "seeds", "quantity": 15, "unit": "g"},
        ],
        "instructions": [
            "Pick up from the campus shop.",
            "Check the label against your allergy settings.",
            "Pair with coffee or water if needed.",
        ],
        "cuisine": None,
        "flavor_profile": ["sweet", "fruity"],
        "techniques": [],
        "equipment": [],
        "source": "Campus shop",
        "note": "2 min pickup - illustrative price",
    },
    {
        "id": "m12",
        "name": "Yoghurt fruit granola cup",
        "meal_type": "fallback",
        "meal_slots": ["breakfast"],
        "price_pence": 240,
        "prep_minutes": 2,
        "dietary_tags": ["vegetarian"],
        "allergens": ["milk", "gluten"],
        "suitability_tags": ["breakfast", "near library", "no cooking"],
        "ingredients": [
            {"name": "yoghurt", "quantity": 150, "unit": "g"},
            {"name": "berries", "quantity": 70, "unit": "g"},
            {"name": "granola", "quantity": 40, "unit": "g"},
        ],
        "instructions": [
            "Pick up chilled.",
            "Check the label for nut traces.",
            "Eat before lectures or keep chilled until mid-morning.",
        ],
        "cuisine": None,
        "flavor_profile": ["sweet", "tangy", "crunchy"],
        "techniques": [],
        "equipment": [],
        "source": "Library Cafe",
        "note": "2 min collection - illustrative price",
    },
    {
        "id": "prep-chicken-rice-base",
        "name": "Lemon Chicken Rice Base",
        "meal_type": "prep_base",
        "meal_slots": ["dinner"],
        "price_pence": 620,
        "prep_minutes": 20,
        "dietary_tags": ["halal"],
        "allergens": [],
        "suitability_tags": ["batch prep", "high-protein", "reheats quickly"],
        "ingredients": [
            {"name": "halal chicken pieces", "quantity": 250, "unit": "g"},
            {"name": "rice", "quantity": 200, "unit": "g"},
            {"name": "lemon juice", "quantity": 30, "unit": "ml"},
            {"name": "peas", "quantity": 80, "unit": "g"},
            {"name": "spinach", "quantity": 60, "unit": "g"},
            {"name": "yoghurt dressing", "quantity": 40, "unit": "ml"},
        ],
        "instructions": [
            "Cook the rice and chicken together.",
            "Fold through peas and spinach.",
            "Portion into boxes with dressing separate.",
        ],
        "cuisine": "Mediterranean",
        "flavor_profile": ["lemony", "savory", "fresh"],
        "techniques": ["boil", "simmer"],
        "equipment": ["pot"],
        "source": None,
        "note": "Cook once, then use cold for lunch or hot for dinner.",
    },
    {
        "id": "prep-smoky-bean-base",
        "name": "Smoky Bean Base",
        "meal_type": "prep_base",
        "meal_slots": ["dinner"],
        "price_pence": 380,
        "prep_minutes": 18,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": [],
        "suitability_tags": ["batch prep", "high-protein", "reheats quickly"],
        "ingredients": [
            {"name": "kidney beans", "quantity": 200, "unit": "g"},
            {"name": "black beans", "quantity": 200, "unit": "g"},
            {"name": "tinned tomatoes", "quantity": 400, "unit": "g"},
            {"name": "smoked paprika", "quantity": 5, "unit": "g"},
            {"name": "onion", "quantity": 1, "unit": "item"},
        ],
        "instructions": [
            "Soften the onion in a large pan.",
            "Add beans, tomatoes, and paprika.",
            "Simmer until thickened, portion into boxes.",
        ],
        "cuisine": "Mexican-inspired",
        "flavor_profile": ["smoky", "rich", "earthy"],
        "techniques": ["sauté", "simmer"],
        "equipment": ["large pan"],
        "source": None,
        "note": "Base for rice bowls and wraps later in the week.",
    },
    {
        "id": "quick-peanut-noodles",
        "name": "Peanut Noodles with Greens",
        "meal_type": "quick_cook",
        "meal_slots": ["dinner"],
        "price_pence": 420,
        "prep_minutes": 9,
        "dietary_tags": ["vegetarian", "vegan"],
        "allergens": ["peanuts"],
        "suitability_tags": ["quick cook", "contains vegetables", "one pan"],
        "ingredients": [
            {"name": "noodles", "quantity": 100, "unit": "g"},
            {"name": "peanut butter", "quantity": 30, "unit": "g"},
            {"name": "soy sauce", "quantity": 15, "unit": "ml"},
            {"name": "frozen greens", "quantity": 100, "unit": "g"},
            {"name": "lime or vinegar", "quantity": 10, "unit": "ml"},
        ],
        "instructions": [
            "Boil noodles and greens together.",
            "Stir peanut butter with soy sauce and a splash of water.",
            "Toss everything together.",
        ],
        "cuisine": "Southeast Asian",
        "flavor_profile": ["nutty", "savory", "tangy"],
        "techniques": ["boil"],
        "equipment": ["pot"],
        "source": None,
        "note": "A proper hot dinner with minimal washing up.",
    },
    {
        "id": "quick-egg-fried-rice",
        "name": "Egg Fried Rice",
        "meal_type": "quick_cook",
        "meal_slots": ["dinner"],
        "price_pence": 280,
        "prep_minutes": 10,
        "dietary_tags": ["vegetarian"],
        "allergens": ["eggs", "soy"],
        "suitability_tags": ["quick cook", "uses leftovers"],
        "ingredients": [
            {"name": "leftover rice", "quantity": 200, "unit": "g"},
            {"name": "eggs", "quantity": 2, "unit": "item"},
            {"name": "soy sauce", "quantity": 15, "unit": "ml"},
            {"name": "frozen peas", "quantity": 60, "unit": "g"},
        ],
        "instructions": [
            "Heat oil in a pan, scramble the eggs.",
            "Add cold rice and peas, stir-fry on high heat.",
            "Season with soy sauce.",
        ],
        "cuisine": "Chinese",
        "flavor_profile": ["savory", "umami", "mild"],
        "techniques": ["stir fry", "scramble"],
        "equipment": ["wok"],
        "source": None,
        "note": "Best with day-old rice.",
    },
    {
        "id": "quick-tuna-couscous",
        "name": "Tuna Couscous",
        "meal_type": "quick_cook",
        "meal_slots": ["lunch", "dinner"],
        "price_pence": 350,
        "prep_minutes": 7,
        "dietary_tags": [],
        "allergens": ["fish", "gluten"],
        "suitability_tags": ["quick cook", "high protein", "one bowl"],
        "ingredients": [
            {"name": "couscous", "quantity": 80, "unit": "g"},
            {"name": "tinned tuna", "quantity": 120, "unit": "g"},
            {"name": "sweetcorn", "quantity": 50, "unit": "g"},
            {"name": "lemon juice", "quantity": 10, "unit": "ml"},
        ],
        "instructions": [
            "Pour boiling water over couscous, cover for 5 mins.",
            "Fluff with a fork, stir in tuna, sweetcorn, and lemon.",
            "Season and eat warm or cold.",
        ],
        "cuisine": "Mediterranean",
        "flavor_profile": ["light", "lemony", "savory"],
        "techniques": [],
        "equipment": ["bowl", "kettle"],
        "source": None,
        "note": "Works hot or cold.",
    },
]


async def seed():
    async with httpx.AsyncClient(
        base_url=API,
        timeout=120,
        headers={"X-Deadline-Food-API-Key": API_KEY},
    ) as client:
        print(f"Seeding {len(PROTOTYPE_MEALS)} recipes...")
        resp = await client.post("/recipes/bulk", json=PROTOTYPE_MEALS)
        resp.raise_for_status()
        recipes = resp.json()
        print(f"  -> {len(recipes)} recipes created/updated")

        print("\nCreating demo user...")
        demo_user = {
            "id": "demo-student",
            "cooking_ability": "basic",
            "kitchen_access": "full",
            "budget_pence": 4800,
            "max_time_minutes": 20,
            "dietary_tags": [],
            "allergens": [],
            "dislikes": [],
            "likes": ["Pasta", "Rice and curry", "Stir fry", "Wraps"],
            "university": "Imperial College London",
        }
        resp = await client.post("/users", json=demo_user)
        resp.raise_for_status()
        print(f"  -> user '{demo_user['id']}' created")

        print("\nStats:")
        resp = await client.get("/stats")
        print(f"  {resp.json()}")

        print("\nTesting recommendations for demo user...")
        resp = await client.post("/recommend", json={"user_id": "demo-student", "n": 5})
        resp.raise_for_status()
        recs = resp.json()
        for r in recs:
            print(f"  {r['score']:.3f}  {r['recipe']['name']}")

        print("\nTesting stress-mode recommendations...")
        resp = await client.post(
            "/recommend",
            json={"user_id": "demo-student", "n": 5, "deadline_stress": 0.8},
        )
        resp.raise_for_status()
        recs = resp.json()
        for r in recs:
            print(f"  {r['score']:.3f}  {r['recipe']['name']} (difficulty: {r['recipe']['difficulty']:.2f})")

        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(seed())
