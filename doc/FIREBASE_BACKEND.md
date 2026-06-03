# Firebase Backend Documentation

## Overview

Firebase is used as a backend platform for:

- Public HTTP functions serving prototype data.
- Anonymous no-sign-in settings persistence.
- OpenFoodFacts nutrition estimates with Firestore caching and rate limiting.
- Verified proxy calls to the GPU recommender API.

The app does not use client-side Firebase SDK reads/writes. Firestore rules currently deny all direct client access.

## Firebase Config

Primary files:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/package.json`
- `functions/tsconfig.json`
- `functions/src/index.ts`

`firebase.json` configures:

- Firestore database `(default)`.
- Firestore location `eur3`.
- Rules file `firestore.rules`.
- Indexes file `firestore.indexes.json`.
- Functions source `functions`.
- Emulators:
  - Functions: `5001`
  - Firestore: `8080`
  - UI: `4000`

## Firestore Rules

Current `firestore.rules`:

```rules
match /{document=**} {
  allow read, write: if false;
}
```

This means:

- Browser code cannot directly read/write Firestore.
- All Firestore access must happen through Firebase Admin in Functions.
- Adding client-side Firebase SDK data access will fail until rules/auth are deliberately changed.

## Firestore Indexes

`firestore.indexes.json` has no active indexes:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

The current Functions queries are simple document gets/sets and collection doc refs, so no custom index is required.

## Functions Runtime

`functions/package.json`:

- Runtime engine: Node 24.
- Main output: `lib/index.js`.
- Dependencies:
  - `firebase-admin`
  - `firebase-functions`
  - `@google-cloud/functions-framework`
- Dev dependencies include TypeScript and ESLint 8 Google config.

`functions/tsconfig.json`:

- `module`: `NodeNext`
- `target`: `es2017`
- `strict`: true
- `outDir`: `lib`
- `noUnusedLocals`: true
- `noImplicitReturns`: true

Build:

```sh
cd functions
bun run build
```

Lint:

```sh
cd functions
bun run lint
```

## Global Function Settings

Defined in `functions/src/index.ts`:

```ts
initializeApp();
setGlobalOptions({ region: "europe-west2", maxInstances: 10 });
```

Public HTTP options:

```ts
const publicHttpOptions = { cors: true, invoker: "public" } as const;
```

Nutrition HTTP options add:

```ts
timeoutSeconds: 300
```

## Function Exports

| Function | Methods | Purpose |
|---|---|---|
| `deadlineFoodBootstrap` | `GET`, `HEAD`, `OPTIONS` | Returns full bootstrap payload: meals, canonical constraints, prototype metadata. |
| `deadlineFoodMeals` | `GET`, `HEAD`, `OPTIONS` | Returns seeded deadline-mode meal catalogue. |
| `deadlineFoodScenario` | `GET`, `HEAD`, `OPTIONS` | Returns canonical constraints. |
| `deadlineFoodSession` | `GET`, `HEAD`, `PUT`, `POST`, `OPTIONS` | Loads/saves anonymous session settings in Firestore. |
| `deadlineFoodNutrition` | `POST`, `OPTIONS` | Estimates nutrition from ingredients via OpenFoodFacts. |
| `deadlineFoodRecipes` | `GET`, `HEAD`, `OPTIONS` | Returns the canonical recipe catalogue from the Firestore `recipes` collection (seeded on first read). |
| `deadlineFoodRecipeReviews` | `GET`, `HEAD`, `POST`, `OPTIONS` | Reads/appends recipe reviews in the Firestore `recipeReviews` collection (global, persistent). |
| `deadlineFoodRecommenderUser` | `POST`, `OPTIONS` | Upserts an anonymous recommender profile. |
| `deadlineFoodRecipeCreate` | `POST`, `OPTIONS` | Writes canonical recipe content to Firestore and embeds it on the recommender keyed by the recipe UID. |
| `deadlineFoodRecommendations` | `POST`, `OPTIONS` | Loads GPU-ranked recipe recommendations. |
| `deadlineFoodInteraction` | `POST`, `OPTIONS` | Records save/pass feedback for recommender learning. |
| `deadlineFoodDeadlineContext` | `POST`, `OPTIONS` | Extracts deadline pressure context from calendar events. |

Unsupported methods return `405` with an `Allow` header.

## GPU Recommender Proxy

The browser must not call `backend/recommender-api` directly. The
`deadlineFoodRecommenderUser`, `deadlineFoodRecipeCreate`,
`deadlineFoodRecommendations`, `deadlineFoodInteraction`, and
`deadlineFoodDeadlineContext` Functions proxy only the FastAPI operations needed
by the frontend. Functions attach a shared
`X-Deadline-Food-API-Key` header; FastAPI rejects unverified application calls.

Provision the Firebase secrets before deployment:

```sh
firebase functions:secrets:set RECOMMENDER_API_URL
firebase functions:secrets:set RECOMMENDER_API_KEY
```

Configure the same key in the GPU server's `/opt/drp03-backend/.env`:

```dotenv
RECOMMENDER_API_KEY=<same-secret-value>
```

`RECOMMENDER_API_URL` must be reachable from Firebase Functions. A URL available
only inside the deployment tailnet is insufficient unless the Functions runtime
has an explicit route into that network.

## Firestore Collections

### `prototypeData/deadlineFood`

Used by:

- `deadlineFoodBootstrap`
- `deadlineFoodMeals`
- `deadlineFoodScenario`

Shape:

```ts
{
  meals: MealOption[],
  canonicalConstraints: PlanningConstraints,
  prototype: {
    productName: string,
    disclaimer: string,
    scenarioName: string
  },
  updatedAt: serverTimestamp()
}
```

If the document does not exist, `getPrototypeData()` seeds it from generated static data.

### `recipes/{recipeId}`

Canonical recipe store (issue #123). Holds the full prototype `Meal` content
(name, ingredients, instructions, nutrition, price, image, tags, …) **without**
reviews or the derived `rating` — those live in `recipeReviews`. The recommender
(pgvector) stores only the recipe UID as primary key plus its embedding, so
Firestore is the source of truth for recipe content.

Used by:

- `deadlineFoodRecipes` — lists recipes; seeds the collection from the generated
  `prototypeRecipes` on first read if empty.
- `deadlineFoodRecipeCreate` — writes recipe content here, then embeds it on the
  recommender keyed by the recipe UID.

### `recipeReviews/{recipeId}`

Global, persistent recipe reviews — the fix for issue #123 (reviews previously
lived in per-session local state and vanished on reload). Shape:

```ts
{
  reviews: { id: string, author: string, rating: number, comment: string, date: string }[],
  updatedAt: serverTimestamp()
}
```

Used by `deadlineFoodRecipeReviews` (`GET` lists, `POST` appends inside a
transaction). Reviews are stored here only and never embedded in the recipe doc
or the recommender.

### `anonymousSessions/{sessionId}`

Used by:

- `deadlineFoodSession`

Shape:

```ts
{
  schemaVersion: 1,
  settingsVersion: 1,
  settings: {
    settingsVersion: 1,
    preferences: {
      maxTime: number | null,
      budget: number,
      kitchen: string,
      postcode: string,
      university: string,
      dietary: string[],
      allergens: string[],
      dislikes: string[],
      likes: string[]
    },
    deadlines: {
      id: string,
      title: string,
      date: string,
      time: string,
      intensity: string
    }[],
    selectedSources: string[],
    onboarded: boolean
  },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  expiresAt: Timestamp
}
```

Session IDs must match:

```regex
^[A-Za-z0-9_-]{16,80}$
```

Retention:

- `expiresAt` is set 90 days from the latest save/load.
- Firestore TTL should be enabled on `anonymousSessions.expiresAt`.

See also [../docs/anonymous-session-storage.md](../docs/anonymous-session-storage.md).

### `openFoodFactsNutritionCache/{docId}`

Used by:

- `deadlineFoodNutrition`

Doc ID:

- Base64url encoding of the normalized ingredient cache key.

Shape:

```ts
{
  cacheKey: string,
  product: OpenFoodFactsProduct | null,
  expiresAt: Timestamp,
  lockedUntil?: Timestamp,
  updatedAt: serverTimestamp()
}
```

Cache policy:

- Found product TTL: 24 hours.
- Missing product TTL: 1 hour.
- Lock TTL: 45 seconds.

### `serviceRateLimits/openFoodFactsSearchV2`

Used by:

- `deadlineFoodNutrition`

Shape:

```ts
{
  nextRequestAt: Timestamp,
  updatedAt: serverTimestamp()
}
```

The function uses a Firestore transaction to schedule OpenFoodFacts requests with a minimum interval.

## OpenFoodFacts Integration

Environment:

- `OPENFOODFACTS_BASE_URL`
- `OPENFOODFACTS_USER_AGENT`

Defaults:

- Production base URL: `https://world.openfoodfacts.org`
- Emulator base URL: `https://world.openfoodfacts.net`
- Timeout: 6000 ms
- Minimum request interval: 6500 ms
- Search API: `/api/v2/search`

Request limit:

- Max 12 ingredients per nutrition request.

Matching approach:

1. Validate recipe ingredients.
2. Build category search terms from ingredient names.
3. Query OpenFoodFacts category search.
4. Choose first product with usable calories/protein/carbs/fat.
5. Estimate nutrition from per-100g values and ingredient grams.
6. Cache product or missing result.
7. Return total rounded calories/macros and match metadata.

The result is an estimate. It is not a medical nutrition source.

## Generated Prototype Data

Firebase Functions import:

- `functions/src/generated/prototypeData.ts`

This file is generated by:

- `scripts/export-firebase-prototype-data.ts`

Source data:

- `src/data/seededScenario.ts`
- `src/data/seededMeals.ts`
- `src/data/meals/*.ts`

Run:

```sh
bun run firebase:data
```

Do not manually edit `functions/src/generated/prototypeData.ts`; regenerate it.

## Local Firebase Emulator Flow

Run:

```sh
bun run firebase:dev
```

This script:

1. Starts the backend Docker Compose stack in the isolated `drp03-firebase-dev` project when an NVIDIA Docker runtime is available.
2. Waits until the recommender API health endpoint responds.
3. Exports generated prototype data.
4. Builds functions.
5. Starts Firebase emulators for Functions, Firestore, and Storage.
6. Waits until `deadlineFoodBootstrap` responds.
7. Starts the Bun app with:
   - `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND=firebase`
   - `BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/<project>/europe-west2`
   - `BUN_PUBLIC_FIREBASE_PROJECT_ID`
   - `BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION`

The same script exports local function secrets so emulated Functions call a
recommender API. `FIREBASE_DEV_BACKEND=auto` is the default: machines with
NVIDIA Docker use the local recommender at `http://127.0.0.1:8100`, while other
machines use `https://recommender.timkolesnichenko.me`. Local compose uses
`RECOMMENDER_API_KEY=local-firebase-dev-recommender-key` unless overridden.
Remote recommender endpoints still require the real `RECOMMENDER_API_KEY` in
your environment. On Ctrl+C or normal exit, the Firebase emulator is stopped and
any compose project started by the script is brought down.

Useful overrides:

```sh
FIREBASE_DEV_BACKEND=remote bun run firebase:dev
FIREBASE_DEV_BACKEND=local bun run firebase:dev
RECOMMENDER_API_URL=http://127.0.0.1:8100 bun run firebase:dev
BACKEND_COMPOSE_SERVICES=api bun run firebase:dev
```

Useful local URLs:

- App: `http://localhost:3000/`
- Emulator UI: `http://127.0.0.1:4000`
- Functions base: `http://127.0.0.1:5001/drp03-50059/europe-west2`
- Recommender API: `http://127.0.0.1:8100`

## Backend Deploy

Root script:

```sh
bun run firebase:deploy
```

It runs:

1. `bun run firebase:data`
2. `firebase functions:artifacts:setpolicy --location europe-west2 --days 7 --force`
3. `firebase deploy --only functions,firestore:rules,firestore:indexes`

CI deploy requires:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY_B64`

Relevant IAM roles are documented in [../README.md](../README.md).

## Backend Security Notes

- Functions are public HTTP endpoints with CORS. Keep request validation strict.
- Firestore is not directly exposed to clients.
- Anonymous session IDs are opaque, but possession of a session ID can read/write that anonymous session.
- Do not store account identifiers, email, or sensitive personal data in anonymous sessions.
- Postcode is part of preferences today; avoid sending it to analytics.
- OpenFoodFacts calls are server-side, rate-limited, cached, and bounded.

## Backend Change Checklist

When changing backend code:

1. Update `functions/src/index.ts`.
2. If seed data changes, update `src/data/*` then run `bun run firebase:data`.
3. Keep generated files generated.
4. Keep local Bun API behaviour aligned if the endpoint is used locally.
5. Add/update tests where possible.
6. Run:

```sh
bun run firebase:data
cd functions && bun run lint && bun run build
```

7. Run root verification before merging:

```sh
bun run verify
```
