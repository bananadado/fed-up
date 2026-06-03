# Project Summary

## Product

Deadline Food Autopilot is a student-facing web prototype for food decisions during deadline weeks. Its purpose is to make healthy-ish, affordable, low-effort food the easiest realistic choice when academic pressure disrupts normal routines.

It is based on [../DEADLINE_FOOD_AUTOPILOT_SPEC.md](../DEADLINE_FOOD_AUTOPILOT_SPEC.md), which defines the concept, MVP constraints, deterministic recommendation logic, seed data requirements, Firebase persistence direction, and acceptance criteria.

## User Problem

The target user is a student under deadline pressure:

- They may normally cook, but deadline weeks change their behaviour.
- They may be in the library or on campus late.
- Budget still matters.
- Cooking is sometimes unrealistic.
- They need practical decisions quickly, not nutrition education.

The app should feel like:

> This fits the week I am actually having.

It should not feel like:

> This is another task I am failing to do properly.

## Core Product Behaviours

The product should demonstrate:

- Deadline awareness through a simulated or imported calendar/workload context.
- Lightweight constraints: budget, kitchen access, max cooking time, dietary needs, location/university.
- A low-effort food plan.
- Explicit affordability: planned spend and remaining budget.
- Rescue/swapping when a meal is not feasible.
- Non-judgemental treatment of fallback purchased meals.
- Seeded, deterministic, testable data.

## Canonical MVP From The Spec

The original spec describes this canonical scenario:

- Steven has three deadline-heavy days.
- He has about GBP 24 for planned meals.
- He expects two late library sessions.
- He can use a kitchen but only accepts one short prep session.
- The app recommends Mixed Mode.
- The plan combines prep, quick remixes, and campus fallback options.
- Steven later has even less time, uses rescue, swaps to a nearby fallback, and sees the updated budget.

## Current Implementation Snapshot

The repository currently contains both an active broader prototype and a cleaner deadline-mode planner slice.

### Active Prototype

Mounted by `src/App.tsx`:

```tsx
export function App() {
  return <DeadlineFoodPrototype />;
}
```

Main files:

- `src/prototype/DeadlineFoodPrototype.tsx`
- `src/prototype/screens/*.tsx`
- `src/prototype/components/*.tsx`
- `src/prototype/data.ts`
- `src/prototype/types.ts`

The active prototype supports:

- Landing page.
- Three-step onboarding.
- Simulated or `.ics` imported calendar workload.
- Preference capture.
- Dashboard.
- Weekly meal plan.
- Meal swap/rescue modal.
- Discover/save/pass recipe flow.
- Custom recipe creation.
- Recipe detail and edit.
- Shopping list generation.
- OpenFoodFacts nutrition estimate calls through the backend.
- Anonymous session persistence for preferences and onboarding state.
- PostHog event instrumentation if configured.

### Dormant Deadline-Mode Router Slice

Not currently mounted:

- `src/app/router.tsx`
- `src/pages/*.tsx`
- `src/domain/*.ts`
- `src/state/DeadlineModeProvider.tsx`
- `src/application/deadlineMode.ts`
- `src/components/deadline-food/*.tsx`

This slice more closely matches `DEADLINE_FOOD_AUTOPILOT_SPEC.md`:

- Routes such as `/deadline-mode/setup`, `/deadline-mode/strategies`, `/deadline-mode/plan`, `/deadline-mode/rescue/:dayId`.
- Three strategies: Prep Once, Mixed Mode, No-Cook Rescue.
- Deterministic `PlanningConstraints`, `MealOption`, `WeeklyPlan`, `RescueProposal` models.
- Pure planner and rescue functions with Bun tests.
- Data loaded from `/api/deadline-food/bootstrap` or Firebase Functions through `src/adapters/deadlineFoodApi.ts`.

## Active Prototype Screen Summary

| Screen | File | Purpose |
|---|---|---|
| Landing | `src/prototype/screens/Landing.tsx` | Product intro and entry CTA. |
| Onboarding | `src/prototype/screens/Onboarding.tsx` | Calendar source, `.ics` import, preferences, dietary/allergen/dislike/like chips, source priorities. |
| Dashboard | `src/prototype/screens/Dashboard.tsx` | Deadline Mode summary, budget card, next cooking, upcoming meals. |
| Calendar | `src/prototype/screens/CalendarScreen.tsx` | Edit workload signals, urgency, effort hours, academic/general classification. |
| Plan | `src/prototype/screens/PlanScreen.tsx` | Weekly grid, budget, shopping list, meal swap/rescue modal. |
| Discover | `src/prototype/screens/DiscoverScreen.tsx` | Browse/save/pass recipes and add liked items to plan. |
| Recipes | `src/prototype/screens/RecipesScreen.tsx` | Add custom recipes and estimate nutrition. |
| Recipe Detail | `src/prototype/screens/RecipeDetailScreen.tsx` | View/edit recipe details, nutrition, reviews, shopping vendor links. |
| Settings | `src/prototype/screens/SettingsScreen.tsx` | Update preferences and calendar import settings. |

## Backend Summary

Backend code exists in two places:

- `src/index.ts`: local Bun app server and local API routes.
- `functions/src/index.ts`: Firebase Functions v2 backend.

Supported backend concerns:

- Serve prototype bootstrap meal/scenario data.
- Persist anonymous session settings in Firestore.
- Estimate recipe nutrition by querying OpenFoodFacts with caching and rate limiting.

Direct Firestore client access is intentionally unavailable because `firestore.rules` denies all reads and writes.

## Data Summary

There are two seed data systems:

1. Active prototype data in `src/prototype/data.ts`.
   - `seedMeals`: active meal catalogue using `Meal`.
   - `initialPlan`: active weekly meal plan.
   - `defaultDeadlines`: active workload scenario.
   - `initialPreferences`: active user preferences.

2. Deadline-mode planner data in `src/data/*`.
   - `seededMeals`: planner catalogue using `MealOption`.
   - `canonicalConstraints`: spec-aligned planning scenario.
   - `deadlineBootstrap`: API bootstrap payload.
   - `scripts/export-firebase-prototype-data.ts`: exports this data into `functions/src/generated/prototypeData.ts`.

## Current Quality Gates

Root package scripts:

- `bun run lint`
- `bun run typecheck`
- `bun run test:unit`
- `bun run test:domain`
- `bun run test:e2e`
- `bun run build`
- `bun run verify`

`bun run verify` is the local full gate and includes Firebase data generation and functions build/lint.

## Product Status

The codebase is a prototype/walking skeleton, not production software. It has credible frontend flows and a real Firebase backend path for anonymous persistence and nutrition estimates, but it does not yet have:

- Authenticated accounts.
- User-owned plan persistence.
- Real provider inventory.
- Real calendar OAuth.
- Direct Firestore client data access.
- A single unified active planner model.

## Implementation Cautions

- Do not assume the React Router pages are visible in the app.
- Do not assume `src/domain` powers the active prototype.
- Do not add medical or weight-loss claims.
- Do not remove prototype disclaimers about illustrative meal availability/prices.
- Do not make Firestore readable from the client without a deliberate auth/rules design.
- Do not use Node/npm/yarn commands where Bun scripts already exist, except where Firebase function tooling explicitly uses Node-style dependencies.

