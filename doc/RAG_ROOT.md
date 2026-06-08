# RAG Root For LLM Coding Agents

Last inspected: 2026-05-29.

This is the root retrieval file for Fed Up. Load this first before modifying the project. It tells you what the product is, which source files are active, where the backend lives, and which deeper docs to retrieve for a task.

## One Sentence

Fed Up is a student deadline-week food planning prototype that helps users choose affordable, low-effort meals and recover when cooking becomes unrealistic.

## Product Intent

The source product brief is [../FED_UP_SPEC.md](../FED_UP_SPEC.md). The product is not a generic recipe app, calorie tracker, delivery marketplace, or LLM meal generator. It is a deadline-aware planning and rescue tool for stressed students.

Core promise:

- Detect or simulate academic pressure.
- Ask for lightweight constraints: budget, cooking time, kitchen access, dietary needs, late campus days.
- Give a realistic plan.
- Treat bought fallback food as legitimate.
- Let the user quickly swap a meal when they have less time.
- Recalculate budget and effort consequences.

MVP non-goals:

- No food ordering or payment.
- No real campus provider inventory.
- No production calendar OAuth.
- No LLM meal recommendations.
- No medical nutrition advice or weight-loss framing.

## Critical Implementation Reality

There are two frontend surfaces in the repo.

1. Active UI: `src/App.tsx` renders `src/prototype/DeadlineFoodPrototype.tsx`.
   - Uses hash navigation like `#/dashboard`, `#/plan`, `#/recipes`.
   - Covered by `e2e/deadline-flow.spec.ts`.
   - Uses `src/prototype/*` data models and state.

2. Dormant React Router deadline-mode vertical slice:
   - `src/app/router.tsx`, `src/pages/*`, `src/domain/*`, `src/state/DeadlineModeProvider.tsx`, `src/components/deadline-food/*`.
   - This is a cleaner deterministic planner matching the original spec.
   - It is not currently mounted because `src/App.tsx` returns `<DeadlineFoodPrototype />`, not `<AppRouter />`.
   - It is covered by `src/domain/planGenerator.test.ts`, but not by the active e2e flow.

Before editing UI, decide which surface the task targets. If the user says "the app", "prototype", or references active screens such as Dashboard, Plan, Discover, Recipes, Settings, or Onboarding, edit `src/prototype/*`. If the user references strategy cards, `/deadline-mode/*` routes, or pure planner logic, edit the dormant router/domain slice unless you are explicitly asked to mount it.

## Current Active User Flow

Active flow from `src/prototype/DeadlineFoodPrototype.tsx`:

1. `landing` screen: `src/prototype/screens/Landing.tsx`.
2. `onboarding` screen: `src/prototype/screens/Onboarding.tsx`.
   - Calendar provider selection or `.ics` import.
   - Preferences: max cooking time, budget, kitchen access, university, postcode, dietary requirements, allergens, dislikes, likes.
   - Recipe source priorities.
3. `dashboard`: `src/prototype/screens/Dashboard.tsx`.
   - Deadline mode summary, budget card, upcoming meals, next cook.
4. `calendar`: `src/prototype/screens/CalendarScreen.tsx`.
   - Edit/import workload signals.
5. `plan`: `src/prototype/screens/PlanScreen.tsx`.
   - Full weekly meal plan, budget, shopping list, meal swap/rescue modal.
6. `discover`: `src/prototype/screens/DiscoverScreen.tsx`.
   - Swipe/save/pass recipe discovery and add saved meals into the plan.
7. `recipes`: `src/prototype/screens/RecipesScreen.tsx`.
   - Add custom recipes, calculate cost per portion, optionally pull nutrition estimates.
8. `recipe-detail`: `src/prototype/screens/RecipeDetailScreen.tsx`.
   - View/edit recipe, nutrition, reviews, grocery vendor links.
9. `settings`: `src/prototype/screens/SettingsScreen.tsx`.
   - Update preferences and reimport calendar data.

Navigation is internal hash state, not React Router. `Shell.tsx` owns desktop/mobile navigation and back behavior.

## Current Backend Summary

Backend has two modes:

- Local Bun server in `src/index.ts`.
- Firebase Functions in `functions/src/index.ts`.

The frontend endpoint selector is `src/adapters/deadlineFoodApi.ts`.

Backend endpoint families:

- Prototype bootstrap data: meals, canonical constraints, metadata.
- Anonymous no-sign-in session storage.
- OpenFoodFacts nutrition estimates for recipe ingredients.

Firebase deployment:

- `firebase.json` configures Firestore and Functions.
- Functions use Node 24, Firebase Functions v2, region `europe-west2`.
- Firestore rules currently deny all direct client reads/writes. The app accesses Firestore only through Functions.
- Firestore indexes are empty.

Firestore collections used by Functions:

- `prototypeData/deadlineFood`
- `anonymousSessions/{sessionId}`
- `openFoodFactsNutritionCache/{base64urlCacheKey}`
- `serviceRateLimits/openFoodFactsSearchV2`

See [FIREBASE_BACKEND.md](FIREBASE_BACKEND.md) and [API_CONTRACTS.md](API_CONTRACTS.md).

## Source Map

Use this table to find the right files quickly.

| Concern | Primary files |
|---|---|
| Product brief | `FED_UP_SPEC.md` |
| Active app mount | `src/App.tsx`, `src/frontend.tsx`, `src/index.html` |
| Bun server and local API | `src/index.ts` |
| Active prototype orchestration | `src/prototype/DeadlineFoodPrototype.tsx` |
| Active prototype types | `src/prototype/types.ts` |
| Active prototype seed data | `src/prototype/data.ts` |
| Active onboarding | `src/prototype/screens/Onboarding.tsx` |
| Active dashboard | `src/prototype/screens/Dashboard.tsx` |
| Active plan and rescue modal | `src/prototype/screens/PlanScreen.tsx` |
| Active recipes | `src/prototype/screens/RecipesScreen.tsx`, `src/prototype/screens/RecipeDetailScreen.tsx` |
| Active settings | `src/prototype/screens/SettingsScreen.tsx` |
| Active session persistence | `src/prototype/sessionPersistence.ts`, `src/prototype/anonymousSessionApi.ts` |
| Active nutrition client | `src/prototype/nutrition.ts`, `src/prototype/nutritionApi.ts` |
| Active shopping list logic | `src/prototype/shopping.ts` |
| Active analytics | `src/lib/posthog.ts`, `src/lib/posthogConfig.ts`, `posthog-setup-report.md` |
| Dormant router | `src/app/router.tsx` |
| Dormant pages | `src/pages/*.tsx` |
| Deterministic planner domain | `src/domain/*.ts` |
| Seeded deadline-mode meals | `src/data/seededMeals.ts`, `src/data/meals/*.ts` |
| Deadline-mode state provider | `src/state/DeadlineModeProvider.tsx`, `src/application/deadlineMode.ts` |
| Firebase Functions | `functions/src/index.ts` |
| Generated function seed data | `functions/src/generated/prototypeData.ts` |
| Data export script | `scripts/export-firebase-prototype-data.ts` |
| Firestore config | `firebase.json`, `firestore.rules`, `firestore.indexes.json` |
| Verification scripts | `scripts/verify-local.sh`, `scripts/firebase-local-dev.sh`, `scripts/audit.sh` |
| CI | `.gitlab-ci.yml` |

## Runtime And Commands

Use Bun by default.

Common commands:

```sh
bun install
bun run dev
bun run build
bun run lint
bun run typecheck
bun run test:unit
bun run test:domain
bun run test:e2e
bun run verify
```

Firebase local development:

```sh
bun run firebase:dev
```

This starts the backend Docker Compose stack on NVIDIA-capable Docker hosts,
then Firestore, Storage, and Functions emulators. On machines without NVIDIA
Docker, emulated Functions fall back to the remote recommender API. The Bun app
is configured to call the local Firebase functions.

Deploy backend:

```sh
bun run firebase:deploy
```

The root verification script installs dependencies if needed, runs root lint/typecheck/tests, exports Firebase prototype data, lints/builds functions, builds the app, runs audit, and then runs Playwright e2e.

## RAG Retrieval Guide

For product questions, retrieve:

- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
- [../FED_UP_SPEC.md](../FED_UP_SPEC.md)

For frontend changes, retrieve:

- [FRONTEND.md](FRONTEND.md)
- [DATA_AND_DOMAIN.md](DATA_AND_DOMAIN.md)
- `src/App.tsx`
- `src/prototype/DeadlineFoodPrototype.tsx`
- The specific screen/component being edited.

For planner, strategy, or rescue logic, retrieve:

- [DATA_AND_DOMAIN.md](DATA_AND_DOMAIN.md)
- `src/domain/types.ts`
- `src/domain/constraints.ts`
- `src/domain/recommendationRules.ts`
- `src/domain/planGenerator.ts`
- `src/domain/rescuePlanner.ts`
- `src/domain/planGenerator.test.ts`

For Firebase or API changes, retrieve:

- [FIREBASE_BACKEND.md](FIREBASE_BACKEND.md)
- [API_CONTRACTS.md](API_CONTRACTS.md)
- `src/adapters/deadlineFoodApi.ts`
- `src/index.ts`
- `functions/src/index.ts`
- `firebase.json`
- `firestore.rules`
- `scripts/firebase-local-dev.sh`

For CI, deployment, or verification, retrieve:

- [DEVELOPMENT_AND_TESTING.md](DEVELOPMENT_AND_TESTING.md)
- `.gitlab-ci.yml`
- `package.json`
- `scripts/verify-local.sh`
- `vercel.json`
- `firebase.json`

For privacy, anonymous persistence, PostHog, and analytics, retrieve:

- [FRONTEND.md](FRONTEND.md)
- [FIREBASE_BACKEND.md](FIREBASE_BACKEND.md)
- [../docs/anonymous-session-storage.md](../docs/anonymous-session-storage.md)
- [../posthog-setup-report.md](../posthog-setup-report.md)

## Project Invariants

Do not break these without an explicit product decision:

- Fed Up stays deadline-week focused.
- The central interaction is plan failure recovery, not generic browsing.
- Purchased fallback meals are neutral and legitimate, not framed as failure.
- Recommendation logic should remain deterministic and explainable for the MVP.
- Seeded provider data must be identified as illustrative.
- Dietary restrictions and allergens are hard filters where the relevant surface supports them.
- Budget impact must remain visible when swapping meals.
- The app must work without account creation.
- Firestore should stay behind backend functions until rules and auth are intentionally designed.
- Do not add an LLM dependency for recommendations unless explicitly requested.

## Known Gaps And Cautions

- The active prototype and dormant router use different data models.
- Active prototype plans are not generated by `src/domain/planGenerator.ts`; they come from `src/prototype/data.ts` and local state.
- Anonymous session persistence stores preferences, deadlines, selected sources, and onboarded state. It does not persist the active plan, custom recipes, route history, or rescue choices.
- Local Bun `/api/deadline-food/session` stores sessions in process memory; server restarts clear it.
- Firebase `deadlineFoodSession` persists anonymous sessions in Firestore.
- `firestore.rules` denies all direct client access.
- OpenFoodFacts nutrition is an estimate, rate-limited, cached, and not medical advice.
- PostHog is optional at runtime and only initializes when public env vars are present.
- Production endpoint selection defaults to Firebase unless overridden by `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND=local`.
- Existing `docs/anonymous-session-storage.md` predates this `doc/` tree and remains useful backend-specific reference.
