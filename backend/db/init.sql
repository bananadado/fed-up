CREATE EXTENSION IF NOT EXISTS vector;

-- Recipes with structured metadata + embedding
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    meal_type TEXT NOT NULL,         -- cook, remix, fallback, prep_base, quick_cook
    meal_slots TEXT[] NOT NULL,      -- {breakfast, lunch, dinner}
    price_pence INTEGER NOT NULL,
    prep_minutes INTEGER NOT NULL,
    difficulty REAL NOT NULL DEFAULT 0.5,
    dietary_tags TEXT[] NOT NULL DEFAULT '{}',
    allergens TEXT[] NOT NULL DEFAULT '{}',
    suitability_tags TEXT[] NOT NULL DEFAULT '{}',
    ingredients JSONB NOT NULL DEFAULT '[]',
    instructions TEXT[] NOT NULL DEFAULT '{}',
    cuisine TEXT,
    flavor_profile TEXT[] NOT NULL DEFAULT '{}',
    techniques TEXT[] NOT NULL DEFAULT '{}',
    equipment TEXT[] NOT NULL DEFAULT '{}',
    nutrition JSONB,
    source TEXT,
    note TEXT,
    verified BOOLEAN NOT NULL DEFAULT false,  -- curated/seed content vs user-contributed
    embedding_text TEXT,             -- synthesized text used for embedding
    embedding vector(384),           -- bge-small-en-v1.5 = 384 dims
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Note: for databases created before #213 (where init.sql has already run and is
-- skipped on restart), the verified column is added in-place by the API's
-- startup migration in recommender-api/app/main.py (_ensure_verified_column).

-- User profiles
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    cooking_ability TEXT NOT NULL DEFAULT 'basic',
    kitchen_access TEXT NOT NULL DEFAULT 'full',
    budget_pence INTEGER NOT NULL DEFAULT 5000,
    max_time_minutes INTEGER NOT NULL DEFAULT 30,
    dietary_tags TEXT[] NOT NULL DEFAULT '{}',
    allergens TEXT[] NOT NULL DEFAULT '{}',
    dislikes TEXT[] NOT NULL DEFAULT '{}',
    likes TEXT[] NOT NULL DEFAULT '{}',
    university TEXT,
    postcode TEXT,
    -- Ability profile (derived from behavior)
    knife_skill REAL NOT NULL DEFAULT 0.5,
    multi_tasking REAL NOT NULL DEFAULT 0.5,
    time_tolerance REAL NOT NULL DEFAULT 0.5,
    spice_preference REAL NOT NULL DEFAULT 0.5,
    adventurousness REAL NOT NULL DEFAULT 0.5,
    healthy_bias REAL NOT NULL DEFAULT 0.5,
    complexity_tolerance REAL NOT NULL DEFAULT 0.5,
    -- User taste embedding (weighted avg of liked recipes)
    taste_embedding vector(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Swipe / interaction events (dense implicit feedback)
CREATE TABLE IF NOT EXISTS interactions (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    recipe_id TEXT NOT NULL REFERENCES recipes(id),
    action TEXT NOT NULL,             -- swipe_right, swipe_left, cook, complete, abandon, save, skip
    dwell_seconds REAL,
    context JSONB,                    -- {deadline_stress: 0.8, time_of_day: "evening", ...}
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Co-like graph for collaborative filtering
CREATE TABLE IF NOT EXISTS co_likes (
    recipe_a TEXT NOT NULL REFERENCES recipes(id),
    recipe_b TEXT NOT NULL REFERENCES recipes(id),
    weight REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (recipe_a, recipe_b)
);

-- Trending recipes (recomputed periodically)
CREATE TABLE IF NOT EXISTS trending (
    recipe_id TEXT PRIMARY KEY REFERENCES recipes(id),
    score REAL NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast filtering and similarity search
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON recipes(meal_type);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_slots ON recipes USING GIN(meal_slots);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON recipes USING GIN(dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_allergens ON recipes USING GIN(allergens);
CREATE INDEX IF NOT EXISTS idx_recipes_embedding ON recipes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_recipe ON interactions(recipe_id);
