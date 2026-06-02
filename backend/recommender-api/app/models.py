from pydantic import BaseModel, Field


class Ingredient(BaseModel):
    name: str
    quantity: float = 0
    unit: str = ""
    preparation: str | None = None


class Nutrition(BaseModel):
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fat: float = 0


class RecipeIn(BaseModel):
    id: str
    name: str
    meal_type: str
    meal_slots: list[str]
    price_pence: int
    prep_minutes: int = 0
    dietary_tags: list[str] = []
    allergens: list[str] = []
    suitability_tags: list[str] = []
    ingredients: list[Ingredient] = []
    instructions: list[str] = []
    cuisine: str | None = None
    flavor_profile: list[str] = []
    techniques: list[str] = []
    equipment: list[str] = []
    nutrition: Nutrition | None = None
    source: str | None = None
    note: str | None = None


class RecipeOut(RecipeIn):
    difficulty: float
    embedding_text: str | None = None


class UserIn(BaseModel):
    id: str
    cooking_ability: str = "basic"
    kitchen_access: str = "full"
    budget_pence: int = 5000
    max_time_minutes: int = 30
    dietary_tags: list[str] = []
    allergens: list[str] = []
    dislikes: list[str] = []
    likes: list[str] = []
    university: str | None = None
    postcode: str | None = None


class UserAbility(BaseModel):
    knife_skill: float = 0.5
    multi_tasking: float = 0.5
    time_tolerance: float = 0.5
    spice_preference: float = 0.5
    adventurousness: float = 0.5
    healthy_bias: float = 0.5
    complexity_tolerance: float = 0.5


class InteractionIn(BaseModel):
    user_id: str
    recipe_id: str
    action: str
    dwell_seconds: float | None = None
    context: dict | None = None


class RecommendRequest(BaseModel):
    user_id: str
    meal_slot: str | None = None
    n: int = Field(default=20, ge=1, le=100)
    deadline_stress: float = Field(default=0.0, ge=0.0, le=1.0)
    exclude_ids: list[str] = []


class ScoredRecipe(BaseModel):
    recipe: RecipeOut
    score: float
    breakdown: dict[str, float]


class CalendarEventIn(BaseModel):
    title: str = ""
    start: str  # ISO datetime or date
    end: str | None = None
    all_day: bool = False


class ContextRequest(BaseModel):
    events: list[CalendarEventIn] = []
    today: str | None = None  # ISO date; defaults to the server's today
    horizon_days: int = Field(default=14, ge=0, le=60)
