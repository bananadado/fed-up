# Data And Domain Logic

## Two Data Models

The repo currently has two separate model systems.

### Active Prototype Model

Files:

- `src/prototype/types.ts`
- `src/prototype/data.ts`

Used by:

- Active UI rendered through `DeadlineFoodPrototype`.

Core types:

```ts
type MealType = "cook" | "remix" | "fallback";
type MealSlot = "breakfast" | "lunch" | "dinner";
```

Important entities:

- `Meal`
- `PlanMeal`
- `PlanEntry`
- `Deadline`
- `Preferences`
- `Nutrition`
- `RecipeReview`

### Dormant Deadline-Mode Planner Model

Files:

- `src/domain/types.ts`
- `src/data/seededMeals.ts`
- `src/data/seededScenario.ts`

Used by:

- Dormant React Router deadline-mode pages.
- Pure domain tests.
- Firebase bootstrap data generation.

Core types:

```ts
type MealType = "prep_base" | "remix" | "quick_cook" | "fallback";
type MealSlot = "lunch" | "dinner";
type PlanStrategy = "prep-once" | "mixed" | "no-cook-rescue";
```

Important entities:

- `PlanningConstraints`
- `MealOption`
- `PlannedMeal`
- `WeeklyPlan`
- `RescueProposal`
- `RankedStrategy`
- `DeadlineBootstrap`

Do not mix these models without an explicit migration plan.

## Active Prototype Seed Data

File:

- `src/prototype/data.ts`

Exports:

- `calendarProviders`
- `days`
- `mealSlots`
- `defaultDeadlines`
- `seedMeals`
- `initialPlan`
- `defaultPlanningPriorities`
- `allergens`
- `dislikes`
- `likes`
- `dietary`
- `universities`
- `initialPreferences`

Active `seedMeals` include:

- Cook meals.
- Remix meals.
- Fallback meals.
- Breakfast, lunch, dinner coverage.
- Ingredients, allergens, nutrition estimates, instructions, source labels, notes, and emoji images.

Recipe content is canonical in the Firestore `recipes` collection (issue #123).
At runtime the active catalogue is hydrated from Firestore via
`fetchRecipeCatalogue` into `recipeCatalogue.ts`, which backs `mealById` /
`getMealById`; `seedMeals` is the bundled fallback used until the fetch resolves
(and offline). Reviews/ratings are no longer seeded here — reviews live in the
Firestore `recipeReviews` collection and ratings derive from them.

Active `initialPlan` covers:

- Mon 1 Jun through Fri 5 Jun.
- Breakfast, lunch, and dinner each day.
- Context labels such as "Late library - Algorithms due".

Active `defaultDeadlines` include:

- Algorithms coursework.
- Design review.
- Databases quiz.

These dates are prototype scenario labels, not dynamic current dates.

## Active Prototype Plan Logic

The active prototype does not currently call a pure planner to generate plans. It starts from `initialPlan` and lets the user mutate it locally.

Plan totals:

- Calculated by summing meal prices from `getMealById`.
- Displayed in `BudgetCard`.

Plan rescue/swap:

- Implemented in `src/prototype/screens/PlanScreen.tsx`.
- Filters alternatives by slot, dislikes, and allergens.
- Sorts by liked tags, time, and price.
- Updates the specific meal slot on confirmation.

Shopping list:

- `ingredientsFromPlan(plan, customRecipes)` aggregates planned meal ingredients and skips leftover slots.
- `aggregateIngredients` combines quantities by name/unit key.

Health signals:

- `mealHealthSignals(meal)` detects broad signals:
  - protein
  - veg or fruit
  - lighter fat
  - high protein
- `weeklyBalanceSummary` counts protein and fruit/veg signals across the plan.

These are broad prototype signals, not medical nutrition claims.

## Active Prototype Workload Logic

File:

- `src/prototype/workloadModel.ts`

Functions:

- `classifyImportedEvent(title)`
- `workloadScore(deadline)`
- `workloadLabel(deadline)`
- `cookingEffortReason(deadline)`

Academic classification:

- A title is academic if it matches terms like coursework, exam, quiz, deadline, submission, review, presentation, or project.

Workload score:

- General events score 0.
- Academic score is effort hours plus urgency score.
- High urgency = 3, medium = 2, low = 1.

Labels:

- Score >= 9: Busy academic day.
- Score >= 5: Moderate study load.
- Academic but lower score: Light academic task.
- General: General calendar event.

## Active Prototype Nutrition Logic

Files:

- `src/prototype/nutrition.ts`
- `src/prototype/nutritionApi.ts`
- `functions/src/index.ts`

Client helper functions:

- `gramsForIngredient`
- `estimateIngredientNutrition`
- `totalNutritionFromEstimates`

API:

- `fetchOpenFoodFactsNutrition(ingredients)`
- Calls `deadlineFoodEndpointUrl("nutrition")`.

The backend contains the production implementation with OpenFoodFacts fetch, cache, and rate limiting. The frontend helper is used for tests and shared estimate semantics.

## Dormant Deadline-Mode Seed Data

Files:

- `src/data/seededMeals.ts`
- `src/data/seededScenario.ts`
- `src/data/meals/*.ts`

Meal catalogue:

- 2 prep bases.
- 4 remix meals.
- 3 quick-cook meals.
- 6 fallback meals.

Meal examples include:

- `prep-smoky-bean-base`
- `prep-chicken-rice-base`
- `remix-bean-rice-bowl`
- `remix-bean-wrap`
- `remix-chicken-rice-pot`
- `remix-chicken-salad-box`
- `quick-peanut-noodles`
- `quick-egg-fried-rice`
- `quick-tuna-couscous`
- `fallback-library-bean-wrap`
- `fallback-library-soup-roll`
- `fallback-campus-rice-bowl`
- `fallback-campus-hummus-box`
- `fallback-halls-jacket-potato`
- `fallback-campus-sushi-snack`

Canonical constraints:

```ts
{
  budgetPence: 2400,
  deadlineDays: ["monday", "wednesday", "thursday"],
  lateCampusDays: ["wednesday", "thursday"],
  maxPrepMinutes: 20,
  kitchenAccess: "full",
  dietaryTags: [],
  mealSlots: ["dinner"],
  preferredLocation: "library"
}
```

Expected domain behaviour:

- Mixed Mode is recommended.
- Generated mixed plan includes prep/remix plus late-campus fallbacks.
- Rescue on a cook/prep meal suggests a compatible fallback.

## Dormant Domain Functions

### Constraints

File:

- `src/domain/constraints.ts`

Functions:

- `validateConstraints`
- `getPlanningDayIds`
- `formatDayLabel`
- `formatMealSlotLabel`
- `formatPlanItemLabel`
- `getContextTags`
- `matchesDietaryTags`
- `canCook`
- `canPrepareBase`
- `getMealSlotsForConstraints`
- `createPlannedMealId`
- `sortByPreferredFallback`

Important rules:

- Budget must be positive.
- Prep time must be zero or more.
- At least one deadline day.
- At least one meal slot.
- Kitchen access must be `full`, `limited`, or `none`.
- Vegetarian requirements allow vegan meals.
- Non-fallback meals must respect max prep time and kitchen access.

Fallback sorting:

1. In-budget relative to projected total.
2. Preferred location match.
3. Lower prep/collection minutes.
4. Lower price.

### Strategy Ranking

File:

- `src/domain/recommendationRules.ts`

Function:

- `rankStrategies(constraints, meals)`

Strategies:

- `prep-once`
- `mixed`
- `no-cook-rescue`

Preference rules:

- No kitchen or less than 10 minutes strongly prefers no-cook rescue.
- Tight budget and at least 20 minutes prep favours prep once.
- Late campus days favour mixed mode.
- In-budget plans get a score bonus.
- Over-budget plans get a score penalty.

### Plan Generation

File:

- `src/domain/planGenerator.ts`

Function:

- `generatePlan(constraints, strategy, meals)`

Plan building:

- Gets planning day IDs Monday-Friday.
- Expands by selected meal slots.
- Picks meals by strategy:
  - Prep Once: prep base first, then remixes/quick cook/fallback.
  - Mixed: prep base when possible, fallbacks on late campus dinners, remixes/quick cooks elsewhere.
  - No Cook: all fallbacks.
- Calculates total cost as sum of meal prices.
- Calculates total prep minutes as sum of meal prep/collection minutes.
- Writes a human explanation.

### Rescue Planning

File:

- `src/domain/rescuePlanner.ts`

Functions:

- `findRescueOptions(plan, dayId, meals)`
- `applyRescueSwap(plan, proposal)`

Rules:

- No proposals if the target day is missing.
- No proposals if the target meal is already fallback.
- Fallbacks must match meal slot and dietary tags.
- Proposals contain old/new totals, time saved, and budget difference.
- Applying a proposal updates only the matching day.
- Totals are recalculated from resulting days.
- Explanation indicates within-budget or over-budget state.

## Dormant Domain Tests

File:

- `src/domain/planGenerator.test.ts`

Tests cover:

- Canonical constraints validate.
- Mixed Mode is recommended for canonical scenario.
- No-Cook Rescue is recommended with no kitchen.
- Prep Once is recommended when budget is tight and prep possible.
- Vegetarian plan does not include incompatible meals.
- Generated totals equal sum of planned meals.
- Lunch and dinner expansion.
- Rescue updates only chosen day.
- Rescue recalculates totals.
- Over-budget rescue is surfaced.

Run:

```sh
bun run test:domain
```

## Anonymous Session Schema

File:

- `src/prototype/sessionPersistence.ts`

Settings version:

```ts
PROTOTYPE_SESSION_SETTINGS_VERSION = 1
```

Settings shape:

```ts
{
  settingsVersion: 1,
  preferences: Preferences,
  deadlines: Deadline[],
  selectedSources: string[], // legacy source toggles
  onboarded: boolean
}
```

Session ID:

- Stored in browser `localStorage` key `deadlineFoodAnonymousSessionId`.
- Created with `crypto.randomUUID()` when available.
- Must match `^[A-Za-z0-9_-]{16,80}$`.

Retention:

- 90 days.
- Backend returns retention and expiry metadata.

## Data Change Checklist

When changing active prototype meals or initial plan:

1. Edit `src/prototype/data.ts`.
2. Update tests if assumptions change.
3. Check active e2e selectors if display copy changes.
4. Run `bun run test:unit` and relevant e2e.

When changing dormant deadline-mode planner meals:

1. Edit `src/data/meals/*.ts` or `src/data/seededMeals.ts`.
2. Run `bun run test:domain`.
3. Run `bun run firebase:data`.
4. Check generated `functions/src/generated/prototypeData.ts`.
5. Run functions build if deploying.

When changing session schema:

1. Bump `PROTOTYPE_SESSION_SETTINGS_VERSION` if breaking.
2. Update frontend normalization and backend normalization.
3. Update `docs/anonymous-session-storage.md` and this doc.
4. Add backward compatibility or explicit migration behaviour.
