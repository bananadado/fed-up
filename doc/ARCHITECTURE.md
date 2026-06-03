# Architecture

## Stack

The project uses:

- Bun for runtime, package management, local server, tests, and build.
- React 19 with TypeScript.
- Tailwind CSS 4 and shadcn-style local UI primitives.
- React Router 7 in the dormant deadline-mode route tree.
- Firebase Functions v2 and Firestore for backend persistence and data APIs.
- Playwright for e2e tests.
- PostHog for optional product analytics and session replay.
- Vercel config for frontend deployment.
- GitLab CI for verification and deployment orchestration.

## Runtime Entry Points

### Local Development Server

`src/index.ts` runs `Bun.serve()`.

Responsibilities:

- Serves `src/index.html` for all unmatched routes.
- Serves local JSON API endpoints under `/api/deadline-food/*`.
- Proxies nutrition calls to Firebase Functions when configured.
- Provides a local in-memory anonymous session implementation.
- Enables HMR and browser console echo in development.

The dev script is:

```sh
bun --hot src/index.ts
```

### Browser Entry

`src/index.html` loads:

```html
<script type="module" src="./frontend.tsx" async></script>
```

`src/frontend.tsx`:

- Creates the React root.
- Initializes/registers PostHog session context.
- Wraps the app in `PostHogProvider` and `PostHogErrorBoundary`.
- Renders `src/App.tsx`.

`src/App.tsx` currently renders:

```tsx
<DeadlineFoodPrototype />
```

So the active app is the prototype hash-router, not `src/app/router.tsx`.

## Frontend Surfaces

### Active Surface: Prototype

Root:

- `src/prototype/DeadlineFoodPrototype.tsx`

The active prototype uses:

- React state hooks, not a global state library.
- Hash navigation, not React Router.
- `src/prototype/types.ts` model types.
- `src/prototype/data.ts` seed data and initial plan.
- `src/prototype/anonymousSessionApi.ts` for anonymous settings persistence.
- `src/prototype/nutritionApi.ts` for OpenFoodFacts nutrition calls.

High-level state owned by `DeadlineFoodPrototype`:

- `screen`
- `routeHistory`
- `onboarded`
- `calendarProvider`
- `deadlines`
- `prefs`
- `selectedSources`
- `plan`
- `customRecipes`
- `discoverSaved`
- `discoverRejected`
- `selectedMealId`

### Dormant Surface: React Router Deadline Mode

Root:

- `src/app/router.tsx`

This route tree uses:

- `BrowserRouter`
- `DeadlineModeProvider`
- `src/application/deadlineMode.ts` reducer/commands
- `src/domain/*` planner functions
- `src/data/seededMeals.ts`
- `src/adapters/deadlineFoodApi.ts`

It has pages for:

- Landing.
- Setup.
- Strategy selection.
- Plan dashboard.
- Rescue.
- Recipe detail.
- Fallback catalogue.

It is useful domain reference and may be mountable later, but it is not the production-visible app today.

## Backend Surfaces

### Local Bun API

Defined in `src/index.ts`:

- `GET /api/deadline-food/bootstrap`
- `GET /api/deadline-food/meals`
- `GET /api/deadline-food/scenario`
- `POST /api/deadline-food/nutrition/openfoodfacts`
- `GET /api/deadline-food/session`
- `PUT /api/deadline-food/session`
- legacy sample endpoints `/api/hello` and `/api/hello/:name`

Local session storage is an in-memory `Map`.

### Firebase Functions

Defined in `functions/src/index.ts`:

- `deadlineFoodBootstrap`
- `deadlineFoodMeals`
- `deadlineFoodScenario`
- `deadlineFoodNutrition`
- `deadlineFoodSession`

All functions use public HTTP invocation and CORS. Firestore access is server-side through Firebase Admin.

## Endpoint Selection

`src/adapters/deadlineFoodApi.ts` decides whether the browser calls local Bun routes or Firebase Functions.

Rules:

- `deadlineFoodApiBackend=local` browser override: force local.
- `deadlineFoodApiBackend=firebase` browser override: force Firebase.
- `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND=local|firebase`: build/runtime env override.
- Production defaults to Firebase.
- Non-production defaults to local.

Browser overrides can be supplied as query params and are stored in `localStorage`.

Default Firebase target:

- Project: `drp03-50059`
- Region: `europe-west2`
- Base URL: `https://europe-west2-drp03-50059.cloudfunctions.net`

## Data Flow: Active Prototype Startup

1. Browser loads `src/frontend.tsx`.
2. `getOrCreateAnonymousSessionId()` reads or creates `deadlineFoodAnonymousSessionId` in `localStorage`.
3. PostHog registers the anonymous session ID if PostHog is configured.
4. `DeadlineFoodPrototype` initializes from local seed data.
5. It calls `loadAnonymousSessionSettings(sessionId)`.
6. The API adapter chooses local Bun session endpoint or Firebase `deadlineFoodSession`.
7. If settings exist, preferences, deadlines, selected sources, and onboarded state are hydrated.
8. Changes are debounced and saved through `saveAnonymousSessionSettings`.

Important: plan state and custom recipes are not persisted by this session mechanism.

## Data Flow: Active Meal Swap

1. `PlanScreen` opens a rescue/swap modal for a chosen day and meal slot.
2. It builds `browseOptions` from custom recipes plus `seedMeals`.
3. Options are filtered by:
   - Meal slot compatibility.
   - Not being the original meal.
   - Avoided disliked ingredients.
   - Avoided allergens.
4. Options are sorted by:
   - User liked-food tag matches.
   - Lower time.
   - Lower price.
5. The best direct option and one more suggested option are shown.
6. Confirming the swap updates the specific `PlanEntry` meal ID and marks it `rescued`.
7. The budget card recalculates from current plan state.

## Data Flow: Dormant Deadline-Mode Planner

1. `DeadlineModeProvider` loads `/api/deadline-food/bootstrap`.
2. Bootstrap includes `meals`, `canonicalConstraints`, and `prototype` metadata.
3. The reducer ranks strategies using `rankStrategies`.
4. Setup submits `PlanningConstraints`.
5. Strategy selection calls `generatePlan`.
6. Plan dashboard shows `WeeklyPlan`.
7. Rescue page calls `findRescueOptions`.
8. Confirming rescue calls `applyRescueSwap`.

## Data Generation For Firebase

`scripts/export-firebase-prototype-data.ts` copies data from:

- `src/data/seededScenario.ts`
- `src/data/seededMeals.ts`

into:

- `functions/src/generated/prototypeData.ts`

This keeps Firebase Functions self-contained after TypeScript build/deploy.

Run it with:

```sh
bun run firebase:data
```

It is part of function build/deploy scripts and local verification.

## Styling Architecture

CSS entry:

- `src/index.css`

It imports:

- `styles/globals.css`

`styles/globals.css` imports Tailwind and `tw-animate-css`, defines shadcn-style CSS variables, and includes light/dark tokens. The active prototype often uses stone/emerald classes directly. UI primitives live in `src/components/ui/*` and `src/prototype/components/primitives.tsx`.

## Build Architecture

`build.ts`:

- Scans `src` for HTML entrypoints.
- Uses Bun build with `bun-plugin-tailwind`.
- Minifies browser output.
- Defines public env constants for the browser bundle.
- Outputs to `dist`.

`vercel.json`:

- Runs `bun run build`.
- Installs with `bun install --frozen-lockfile`.
- Serves `dist`.
- Rewrites all paths to `/index.html`.
- Disables Vercel git deployment by default.

## Deployment Architecture

Frontend:

- Vercel via `.gitlab-ci.yml` deploy jobs.
- Staging deploys on `staging`.
- Production deploys on `master`.

Backend:

- Firebase deploy jobs run before corresponding Vercel deploy jobs.
- Firebase deploys functions, Firestore rules, and indexes.
- CI supplies `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_KEY_B64`.

## Architectural Risk Areas

- Two frontend surfaces can cause edits in the wrong tree.
- Active prototype and dormant planner have different types and seed catalogues.
- Local Bun API session storage differs from Firebase Firestore-backed session storage.
- Firebase functions are public HTTP functions; validation and rate limiting matter.
- Firestore rules are locked down, so client SDK additions will fail unless rules/auth are designed.
- The OpenFoodFacts integration duplicates some nutrition estimate logic between frontend tests and functions.

