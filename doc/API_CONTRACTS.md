# API Contracts

## Endpoint Selection

Frontend endpoint construction lives in:

- `src/adapters/deadlineFoodApi.ts`

Supported logical endpoints:

```ts
type DeadlineEndpoint =
  | "bootstrap"
  | "meals"
  | "scenario"
  | "session"
  | "nutrition";
```

Local Bun paths:

| Logical endpoint | Local path |
|---|---|
| `bootstrap` | `/api/deadline-food/bootstrap` |
| `meals` | `/api/deadline-food/meals` |
| `scenario` | `/api/deadline-food/scenario` |
| `session` | `/api/deadline-food/session` |
| `nutrition` | `/api/deadline-food/nutrition/openfoodfacts` |
| `recipes` | `/api/deadline-food/recipes` |
| `recipe-reviews` | `/api/deadline-food/recipe-reviews` |
| `auto-plan` | `/api/deadline-food/auto-plan` |

Firebase function names:

| Logical endpoint | Function |
|---|---|
| `bootstrap` | `deadlineFoodBootstrap` |
| `meals` | `deadlineFoodMeals` |
| `scenario` | `deadlineFoodScenario` |
| `session` | `deadlineFoodSession` |
| `nutrition` | `deadlineFoodNutrition` |
| `recipes` | `deadlineFoodRecipes` |
| `recipe-reviews` | `deadlineFoodRecipeReviews` |
| `auto-plan` | `deadlineFoodAutoPlan` |

Selection rules:

- Browser query/localStorage override `deadlineFoodApiBackend=local|firebase`.
- Env `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND=local|firebase`.
- Production defaults to Firebase.
- Non-production defaults to local.

Firebase base URL can be overridden with:

- Browser query/localStorage `firebaseFunctionsBaseUrl`.
- Env `BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL`.

## GPU Recommender Boundary

The browser never calls `backend/recommender-api` directly. Discover requests use:

| Browser operation | Local Bun path | Firebase Function | FastAPI endpoint |
|---|---|---|---|
| Sync anonymous profile | `/api/recommender/user` | `deadlineFoodRecommenderUser` | `POST /users` |
| Create a recipe (Firestore + embed) | `/api/recommender/recipe` | `deadlineFoodRecipeCreate` | `POST /recipes` |
| Load ranked recipes | `/api/recommender/recommendations` | `deadlineFoodRecommendations` | `POST /recommend` |
| Record save/pass feedback | `/api/recommender/interaction` | `deadlineFoodInteraction` | `POST /interactions` |
| Extract deadline context | `/api/recommender/deadline-context` | `deadlineFoodDeadlineContext` | `POST /context/deadlines` |
| Auto-plan the food calendar | `/api/deadline-food/auto-plan` | `deadlineFoodAutoPlan` | `POST /context/deadlines` + `POST /recommend` |

`deadlineFoodAutoPlan` (issue #66) orchestrates auto-planning: it requests per-day
calendar context and recommender ranking, then runs a deterministic allocator
(`functions/src/autoPlan.ts`) that lays saved recipes (recommender gap-fill after)
across the planning horizon — batch cooks on relaxed days seed leftovers onto busy
days. Request: `{user_id, horizonDays, contextEvents[], savedRecipes[], excludeIds[],
dislikes[], allergens[]}`. Response: `{plan: PlanEntry[], meals: Meal[], generatedAt}`.

Firebase Functions attach `X-Deadline-Food-API-Key` when calling FastAPI. The shared
`RECOMMENDER_API_KEY` must be configured in both Firebase Secret Manager and the
GPU backend environment. The backend returns `401` for application requests that
do not carry the expected key. `/health`, `/metrics`, and API schema pages remain
public for monitoring and inspection.

Discover is driven entirely by the recommender. Recommended recipes are built
from the API response (not merged onto local seed data), and user-created
recipes are embedded on creation so they participate in ranking and feedback.
When the recommender is unavailable the Discover queue shows only the user's own
recipes rather than faking suggestions from the local seed catalogue.

## Recipes & Reviews (issue #123)

Recipe content is canonical in the Firestore `recipes` collection; the
recommender (pgvector) stores only the recipe UID as primary key plus its
embedding. Reviews live in the Firestore `recipeReviews` collection only — they
are global and persist across reloads, fixing the prior session-local behaviour.

| Browser operation | Local Bun path | Firebase Function |
|---|---|---|
| List canonical recipes | `/api/deadline-food/recipes` | `deadlineFoodRecipes` |
| Load a recipe's reviews | `GET /api/deadline-food/recipe-reviews?recipeId=<id>` | `deadlineFoodRecipeReviews` |
| Leave a review | `POST /api/deadline-food/recipe-reviews` | `deadlineFoodRecipeReviews` |

`deadlineFoodRecipeCreate` writes recipe content to `recipes/{id}` (stripping
`reviews`/`rating`) and then embeds the recipe on the recommender keyed by the
UID. Review responses are `{ reviews: RecipeReview[], rating: number }`; the POST
body is `{ recipeId, review: { author, rating, comment } }`.

## Bootstrap

### Local

```http
GET /api/deadline-food/bootstrap
```

### Firebase

```http
GET /deadlineFoodBootstrap
HEAD /deadlineFoodBootstrap
OPTIONS /deadlineFoodBootstrap
```

Response:

```ts
type DeadlineBootstrap = {
  meals: MealOption[];
  canonicalConstraints: PlanningConstraints;
  prototype: {
    productName: string;
    disclaimer: string;
    scenarioName: string;
  };
};
```

Firebase behaviour:

- Reads `prototypeData/deadlineFood`.
- If missing, seeds from generated data and returns it.
- Adds cache header `public, max-age=60, s-maxage=300`.

Errors:

- `405` unsupported method.
- `500` if prototype data cannot be loaded.

## Meals

### Local

```http
GET /api/deadline-food/meals
```

### Firebase

```http
GET /deadlineFoodMeals
HEAD /deadlineFoodMeals
OPTIONS /deadlineFoodMeals
```

Response:

```ts
MealOption[]
```

Same cache and error semantics as bootstrap.

## Canonical Scenario

### Local

```http
GET /api/deadline-food/scenario
```

### Firebase

```http
GET /deadlineFoodScenario
HEAD /deadlineFoodScenario
OPTIONS /deadlineFoodScenario
```

Response:

```ts
PlanningConstraints
```

Canonical current value:

```json
{
  "budgetPence": 2400,
  "deadlineDays": ["monday", "wednesday", "thursday"],
  "lateCampusDays": ["wednesday", "thursday"],
  "maxPrepMinutes": 20,
  "kitchenAccess": "full",
  "dietaryTags": [],
  "mealSlots": ["dinner"],
  "preferredLocation": "library"
}
```

## Anonymous Session

Frontend client:

- `src/prototype/anonymousSessionApi.ts`

Logical endpoint:

- `deadlineFoodEndpointUrl("session")`

### Load Session

```http
GET /api/deadline-food/session?sessionId=<session-id>
```

Firebase:

```http
GET /deadlineFoodSession?sessionId=<session-id>
HEAD /deadlineFoodSession?sessionId=<session-id>
```

Session ID validation:

```regex
^[A-Za-z0-9_-]{16,80}$
```

Response when missing:

```json
{
  "sessionId": "<session-id>",
  "settings": null,
  "retentionDays": 90,
  "expiresAt": null
}
```

Response when found:

```ts
{
  sessionId: string;
  settings: PrototypeSessionSettings;
  retentionDays: 90;
  expiresAt: string;
}
```

Firebase behaviour:

- Reads `anonymousSessions/{sessionId}`.
- Normalizes settings before returning.
- Refreshes `updatedAt` and `expiresAt`.

Local Bun behaviour:

- Reads from an in-memory `Map`.
- Refreshes in-memory `expiresAt` and `updatedAt` when found.
- Does not persist across server restarts.

Errors:

- `400` invalid or missing session ID.
- `405` unsupported method.
- `500` Firebase session load failed.

### Save Session

Local:

```http
PUT /api/deadline-food/session
Content-Type: application/json

{
  "sessionId": "<session-id>",
  "settings": {
    "settingsVersion": 1,
    "preferences": { "...": "..." },
    "deadlines": [],
    "selectedSources": [],
    "onboarded": false
  }
}
```

Firebase:

```http
PUT /deadlineFoodSession
POST /deadlineFoodSession
Content-Type: application/json
```

Firebase behaviour:

- If body `sessionId` is valid, uses it.
- If body `sessionId` is absent/invalid for save, generates a UUID.
- Normalizes and bounds settings before writing.
- Writes `schemaVersion`, `settingsVersion`, `settings`, timestamps, and `expiresAt`.

Local Bun behaviour:

- Requires a valid session ID.
- Requires `settings` to be an object.
- Writes to in-memory map.

Important difference:

- Firebase save can generate a session ID if invalid/missing.
- Local Bun save rejects invalid/missing session ID.

## Nutrition

Frontend client:

- `src/prototype/nutritionApi.ts`

Request:

```http
POST /api/deadline-food/nutrition/openfoodfacts
Content-Type: application/json

{
  "ingredients": [
    {
      "name": "oats",
      "quantity": 50,
      "unit": "g"
    }
  ]
}
```

Firebase:

```http
POST /deadlineFoodNutrition
OPTIONS /deadlineFoodNutrition
```

Response:

```ts
type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: {
    provider: "OpenFoodFacts";
    label: "OpenFoodFacts estimate";
    fetchedAt: string;
    matchedIngredients: {
      ingredient: string;
      productName: string;
      grams: number;
    }[];
    missingIngredients: string[];
  };
};
```

Validation:

- Method must be POST.
- Ingredients must be an array.
- At least one valid ingredient required.
- Max 12 ingredients.
- Ingredient must have:
  - non-empty string `name`
  - positive finite numeric `quantity`
  - non-empty string `unit`

Errors:

- `400` if no valid ingredients or more than 12 raw ingredients.
- `405` unsupported method.
- `502` if OpenFoodFacts returns no usable nutrition data.
- `500` if nutrition data could not be loaded.

Local behaviour:

- `src/index.ts` proxies to Firebase function `deadlineFoodNutrition`.
- If `BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL` is not configured, local endpoint returns `503`.
- If the emulator/function cannot be reached, returns `502`.

## Legacy Sample API

`src/index.ts` also exposes sample endpoints:

```http
GET /api/hello
PUT /api/hello
GET /api/hello/:name
```

These are template/demo endpoints and are not part of Deadline Food Autopilot's product API.

## API Change Checklist

When adding or changing an endpoint:

1. Update `src/adapters/deadlineFoodApi.ts` if the frontend needs it.
2. Update local Bun route in `src/index.ts`.
3. Update Firebase function in `functions/src/index.ts`.
4. Keep response shapes aligned between local and Firebase modes.
5. Add validation to public Firebase functions.
6. Update docs in this file and [FIREBASE_BACKEND.md](FIREBASE_BACKEND.md).
7. Run:

```sh
bun run lint
bun run typecheck
bun run firebase:data
cd functions && bun run lint && bun run build
```
