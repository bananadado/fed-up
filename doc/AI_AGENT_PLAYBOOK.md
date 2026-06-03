# AI Agent Playbook

This document is for LLM coding agents modifying the repo.

## First Steps For Any Task

1. Read [RAG_ROOT.md](RAG_ROOT.md).
2. Check `git status --short`.
3. Confirm whether the task targets the active prototype or dormant React Router planner.
4. Inspect the exact files before editing.
5. Use Bun commands.
6. Keep edits scoped.
7. Run relevant tests/checks.

## Choosing The Correct Frontend Surface

Use this rule:

- Active user-visible app: edit `src/prototype/*`.
- Strategy comparison and `/deadline-mode/*` routes: edit `src/pages/*`, `src/domain/*`, `src/state/*`, `src/components/deadline-food/*`.
- If asked to "make the app use the new router", update `src/App.tsx` to render `AppRouter`, then update tests and verify end to end.

Warning: many future bugs will come from changing `src/pages/*` while expecting the active prototype to change. `src/App.tsx` is the source of truth.

## Common Task: Change Landing Or Onboarding

Likely files:

- `src/prototype/screens/Landing.tsx`
- `src/prototype/screens/Onboarding.tsx`
- `src/prototype/data.ts`
- `src/prototype/types.ts`
- `src/prototype/sessionPersistence.ts` if persisted settings change.

Tests:

```sh
bun run lint
bun run typecheck
bun run test:unit
bun run test:e2e
```

Check e2e selectors if heading/button text changes.

## Common Task: Change Active Meal Swap Rescue

Likely files:

- `src/prototype/screens/PlanScreen.tsx`
- `src/prototype/data.ts`
- `src/prototype/utils.ts`
- `src/prototype/healthSignals.ts`
- `src/prototype/shopping.ts`

Keep:

- Budget before/after visible.
- Original and replacement visible.
- Cost/time delta visible.
- Restrictions and allergens respected.
- Rescue tone neutral.

Tests:

```sh
bun test src/prototype/shopping.test.ts
bun run test:e2e
```

## Common Task: Add Or Edit Active Prototype Meal Data

File:

- `src/prototype/data.ts`

Required fields for `Meal`:

- `id`
- `name`
- `type`
- `mealSlots`
- `time`
- `price`
- `tags`
- `ingredients`
- `allergens`
- `nutrition`
- `rating`
- `reviews`
- `instructions`
- `source`
- `note`
- `image`

Check:

- Meal IDs referenced in `initialPlan` exist.
- Slot compatibility works.
- Allergens and ingredients are coherent.
- Fallback meals should use honest illustrative source/note wording.

## Common Task: Change Dormant Strategy/Planner Logic

Likely files:

- `src/domain/constraints.ts`
- `src/domain/recommendationRules.ts`
- `src/domain/planGenerator.ts`
- `src/domain/rescuePlanner.ts`
- `src/domain/types.ts`
- `src/domain/planGenerator.test.ts`

Run:

```sh
bun run test:domain
bun run typecheck
```

Preserve invariants:

- Dietary constraints are hard filters.
- No-kitchen plans should not require cooking.
- Totals equal sum of meal prices.
- Rescue updates one day only.
- Budget overrun is surfaced honestly.

## Common Task: Add Deadline-Mode Seed Meal

Likely files:

- Add or edit `src/data/meals/*.ts`.
- Update `src/data/seededMeals.ts`.
- If Firebase bootstrap should include it, run `bun run firebase:data`.

Run:

```sh
bun run test:domain
bun run firebase:data
cd functions && bun run build
```

Do not edit `functions/src/generated/prototypeData.ts` directly.

## Common Task: Change Anonymous Session Persistence

Frontend files:

- `src/prototype/sessionPersistence.ts`
- `src/prototype/anonymousSessionApi.ts`
- `src/prototype/DeadlineFoodPrototype.tsx`

Backend file:

- `functions/src/index.ts`

Docs:

- `docs/anonymous-session-storage.md`
- `doc/FIREBASE_BACKEND.md`
- `doc/API_CONTRACTS.md`
- `doc/DATA_AND_DOMAIN.md`

If schema changes are breaking:

- Bump settings version.
- Add migration/backward handling or reject old settings intentionally.
- Update frontend and backend normalization together.

Tests:

```sh
bun test src/prototype/sessionPersistence.test.ts
cd functions && bun run build
```

## Common Task: Change Nutrition Estimates

Frontend files:

- `src/prototype/nutrition.ts`
- `src/prototype/nutritionApi.ts`
- `src/prototype/screens/RecipesScreen.tsx`
- `src/prototype/screens/RecipeDetailScreen.tsx`

Backend file:

- `functions/src/index.ts`

Tests:

```sh
bun test src/prototype/nutrition.test.ts
cd functions && bun run lint && bun run build
```

Cautions:

- Keep request size bounded.
- Keep OpenFoodFacts calls rate-limited/cached.
- Do not present estimates as medical certainty.

## Common Task: Add Backend Endpoint

Steps:

1. Add logical endpoint to `src/adapters/deadlineFoodApi.ts` if the browser needs it.
2. Add local route to `src/index.ts`.
3. Add Firebase function to `functions/src/index.ts`.
4. Validate inputs.
5. Align local and Firebase response shapes.
6. Update [API_CONTRACTS.md](API_CONTRACTS.md).
7. Run root and function checks.

Commands:

```sh
bun run lint
bun run typecheck
cd functions && bun run lint && bun run build
```

## Common Task: Mount The React Router App

This is a larger product/architecture change.

Required changes:

1. Update `src/App.tsx`:

```tsx
import { AppRouter } from "@/app/router";
import "./index.css";

export function App() {
  return <AppRouter />;
}
```

2. Update e2e tests because current selectors target the active prototype.
3. Check bootstrap loading in `DeadlineModeProvider`.
4. Check production Firebase endpoint selection.
5. Verify browser routes work with Vercel rewrites and Bun fallback.
6. Decide whether to keep or remove hash prototype code.

Run full verification:

```sh
bun run verify
```

## Common Task: Improve Firebase Persistence

Current state:

- Anonymous settings persist.
- Plans do not persist.
- Custom recipes do not persist.
- Firestore rules deny client access.

Recommended approach:

- Add persistence through Functions first.
- Keep anonymous session storage versioned.
- Avoid client Firestore SDK writes until auth/rules exist.
- If adding authenticated users, design migration from anonymous session settings.

## Product Language Rules

Use:

- "fallback"
- "swap"
- "compatible"
- "budget left"
- "over budget"
- "illustrative price"
- "broad nutrition signal"

Avoid:

- "failure"
- "bad food"
- "cheat"
- "diet"
- weight-loss language
- medical health claims
- fake real-time availability claims

## Testing Strategy By Risk

Small copy-only active UI change:

```sh
bun run lint
bun run typecheck
```

Active prototype behaviour change:

```sh
bun run lint
bun run typecheck
bun run test:unit
bun run test:e2e
```

Domain planner change:

```sh
bun run test:domain
bun run typecheck
```

Backend function change:

```sh
bun run firebase:data
cd functions && bun run lint && bun run build
```

Deployment or shared contract change:

```sh
bun run verify
```

## Known Pitfalls

- `src/pages/*` is not active unless `AppRouter` is mounted.
- `src/domain/*` does not drive the active prototype plan.
- Local session persistence is in memory only.
- Firebase save can create a session ID on invalid input, local save rejects it.
- Firestore direct client access is blocked.
- PostHog may be undefined if token env is missing; use optional calls.
- E2E tests use visible text selectors, so copy changes can break tests.
- Generated Firebase prototype data should not be manually edited.
- The active prototype stores prices in pounds as numbers; dormant domain stores pence as integers.
- Active `MealType` is `cook|remix|fallback`; dormant `MealType` is `prep_base|remix|quick_cook|fallback`.

