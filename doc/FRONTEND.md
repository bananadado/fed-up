# Frontend Documentation

## Active Frontend

The active application is `src/prototype/DeadlineFoodPrototype.tsx`, rendered by `src/App.tsx`.

Do not assume `src/app/router.tsx` is active. It is a separate React Router implementation that is currently dormant.

## Browser Boot

Files:

- `src/index.html`
- `src/frontend.tsx`
- `src/App.tsx`
- `src/index.css`

Boot sequence:

1. `src/index.html` loads `frontend.tsx`.
2. `frontend.tsx` creates the React root.
3. It gets or creates the anonymous session ID.
4. It registers the PostHog session ID.
5. It wraps the app in `PostHogProvider` and `PostHogErrorBoundary`.
6. It renders `<App />`.
7. `App` renders `<DeadlineFoodPrototype />`.

## Active Prototype Navigation

Navigation is hash-based.

Supported screens:

```ts
type Screen =
  | "landing"
  | "onboarding"
  | "dashboard"
  | "calendar"
  | "plan"
  | "discover"
  | "recipes"
  | "settings"
  | "recipe-detail";
```

URLs look like:

- `/`
- `/#/onboarding`
- `/#/dashboard`
- `/#/plan`

`DeadlineFoodPrototype.tsx` maintains `routeHistory` and `previousScreen` for back behavior. `Shell.tsx` renders the header, desktop nav, mobile nav, and back button after onboarding.

## Active Prototype State

`DeadlineFoodPrototype` owns the main state:

| State | Purpose |
|---|---|
| `sessionId` | Anonymous browser session ID. |
| `sessionLoaded` | Whether remote/local session settings have been loaded. |
| `screen` | Current hash screen. |
| `previousScreen` and `routeHistory` | Back navigation. |
| `onboarded` | Whether onboarding has completed. |
| `calendarProvider` | Selected calendar source. |
| `deadlines` | Workload/deadline signals. |
| `prefs` | User preferences and constraints. |
| `selectedSources` | Recipe source/prioritization toggles. |
| `plan` | Active weekly plan entries. |
| `customRecipes` | Recipes added or edited during this session. |
| `discoverSaved` | Saved Discover meals. |
| `discoverRejected` | Recently rejected Discover meals. |
| `selectedMealId` | Recipe detail target. |

Persisted through anonymous session:

- `prefs`
- `deadlines`
- `selectedSources`
- `onboarded`

Not persisted:

- `plan`
- `customRecipes`
- `discoverSaved`
- `discoverRejected`
- route history
- selected recipe
- rescue choices

## Active Prototype Data Model

Defined in `src/prototype/types.ts`.

Important types:

- `Meal`
- `PlanEntry`
- `PlanMeal`
- `Deadline`
- `Preferences`
- `Nutrition`
- `RecipeReview`
- `CalendarProvider`

Active meal type:

```ts
type MealType = "cook" | "remix" | "fallback";
```

Active meal slots:

```ts
type MealSlot = "breakfast" | "lunch" | "dinner";
```

This differs from the dormant planner model in `src/domain/types.ts`.

## Active Prototype Screens

### Landing

File:

- `src/prototype/screens/Landing.tsx`

Purpose:

- Product proposition.
- CTA to start onboarding.
- Simulated meal plan preview and deadline cards.

Events:

- `deadline_mode_started`

### Onboarding

File:

- `src/prototype/screens/Onboarding.tsx`

Three steps:

1. Calendar source and workload import.
2. Preferences, budget, kitchen, university, postcode, dietary safety, dislikes, likes.
3. Recommendation source priorities.

Calendar behaviour:

- Supports fake provider selection.
- Supports `.ics` file import.
- Parses up to five imported events.
- Classifies titles as academic/general using `src/prototype/workloadModel.ts`.

Important controls:

- Max cooking time range.
- Unlimited cooking time switch.
- Budget number input.
- Kitchen access select.
- University select.
- Postcode field.
- Dietary/allergen/dislike/like `ChoiceGroup` chips.
- Recipe source toggles.

Events include:

- `calendar_source_selected`
- `ics_calendar_imported`
- `onboarding_step_completed`
- `onboarding_choice_toggled`
- `onboarding_custom_choice_added`
- `onboarding_completed`

### Dashboard

File:

- `src/prototype/screens/Dashboard.tsx`

Purpose:

- Show Deadline Mode active.
- Show Mixed Mode copy.
- Display planned spend via `BudgetCard`.
- Display next cooking meal.
- Display upcoming meals.
- Link to calendar and full plan.

Supporting logic:

- `src/prototype/healthSignals.ts`
- `src/prototype/utils.ts`

### Calendar

File:

- `src/prototype/screens/CalendarScreen.tsx`

Purpose:

- Review and edit workload events.
- Add manual academic workload.
- Mark event type, effort hours, and urgency.
- Explain how workload affects cooking effort.

Important helper:

- `src/prototype/workloadModel.ts`

Validation:

- Manual event title required.
- Manual event time required and validated with `clockTimeInputPattern`.
- Urgency required.

### Plan

File:

- `src/prototype/screens/PlanScreen.tsx`

Purpose:

- Display full weekly meal grid.
- Show desktop table and mobile cards.
- Show budget summary.
- Show weekly balance.
- Show shopping list drawer.
- Provide meal swap/rescue modal.

Meal swap behaviour:

- Opened through "Change meal".
- Selects a day and meal slot.
- Builds alternatives from custom recipes plus seeded meals.
- Filters out original meal.
- Filters by compatible meal slot.
- Filters against dislikes and allergens.
- Sorts by liked tags, lower time, then lower price.
- Shows direct suggested options.
- Shows current total, total after best fit, budget left/over, time difference, and cost difference.
- Confirming swap updates the one plan meal and marks it `rescued`.

Shopping list:

- `ShoppingListCard` opens in a right drawer.
- `ingredientsFromPlan` aggregates plan ingredients.
- Supports grocery vendor selection and external search links.

### Discover

File:

- `src/prototype/screens/DiscoverScreen.tsx`

Purpose:

- Show a queue of recipe cards.
- Sort by priority, time, price, or health.
- Save or pass on current meal.
- Undo recently passed meals.
- Add saved meal to Tuesday's plan.

Current recommendation is simple heuristic sorting, not an LLM.

### Recipes

File:

- `src/prototype/screens/RecipesScreen.tsx`

Purpose:

- Add custom recipes.
- Calculate cost per portion from total recipe cost and servings.
- Edit ingredients with `IngredientEditor`.
- Optionally estimate nutrition by calling backend OpenFoodFacts function.

Validation:

- Name required.
- At least one ingredient required.
- Servings must be at least 1.
- Total recipe cost must be positive.

Custom recipes are kept in component state only.

### Recipe Detail

File:

- `src/prototype/screens/RecipeDetailScreen.tsx`

Purpose:

- Display full meal detail.
- Display nutrition and source summary.
- Display tags, allergens, ingredients, method, notes, reviews.
- Edit seeded or custom meal into the custom recipe list.
- Refresh nutrition estimates.
- Leave a prototype review.
- Show grocery vendor shopping links for ingredients.

Important: editing a seeded meal saves a custom copy into `customRecipes`; it does not mutate `src/prototype/data.ts`.

### Settings

File:

- `src/prototype/screens/SettingsScreen.tsx`

Purpose:

- Update the same preference set from onboarding.
- Reimport calendar `.ics` files.
- Update selected calendar provider.
- Navigate back to dashboard.

## Active Components

Prototype components:

- `src/prototype/components/Shell.tsx`
- `src/prototype/components/BudgetCard.tsx`
- `src/prototype/components/ShoppingListCard.tsx`
- `src/prototype/components/IngredientEditor.tsx`
- `src/prototype/components/primitives.tsx`

Shared UI primitives:

- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/textarea.tsx`

Use these local primitives before adding new UI libraries.

## Active Prototype Helpers

| File | Purpose |
|---|---|
| `src/prototype/utils.ts` | Money formatting, cooking limit display, `.ics` parsing utility, meal lookup, nutrition source display. |
| `src/prototype/ingredients.ts` | Ingredient drafts, formatting, sanitisation. |
| `src/prototype/shopping.ts` | Grocery vendors, aggregate ingredients, shopping list labels. |
| `src/prototype/healthSignals.ts` | Broad protein/veg/fat signals and weekly balance summary. |
| `src/prototype/workloadModel.ts` | Calendar event classification, workload score, workload labels, effort explanations. |
| `src/prototype/nutrition.ts` | Client-side nutrition estimate helpers used in tests and mirrored by backend. |
| `src/prototype/nutritionApi.ts` | Calls the backend nutrition endpoint. |
| `src/prototype/sessionPersistence.ts` | Anonymous session ID and settings schema. |
| `src/prototype/anonymousSessionApi.ts` | Load/save anonymous settings through API adapter. |

## Analytics

PostHog files:

- `src/lib/posthog.ts`
- `src/lib/posthogConfig.ts`
- `posthog-setup-report.md`

PostHog initializes only when `BUN_PUBLIC_POSTHOG_PROJECT_TOKEN` is available. It registers the anonymous session ID and captures manual events from prototype screens.

Privacy controls:

- Inputs masked in session replay.
- Network request/response headers and bodies removed from replay capture.
- Personal data properties masked.
- `postcode` and `sessionId` denied as explicit properties.

When adding analytics:

- Use `track("event_name", properties)` in prototype screens.
- Do not include raw postcode, email, name, full address, session ID, or free-text sensitive content.
- Prefer aggregate counts and categorical values.

## Styling And UX

The active prototype uses:

- Background `#faf9f5`.
- Emerald as the primary action/accent family.
- Stone neutrals.
- Rounded `rounded-lg` cards and controls.
- Responsive desktop/mobile layouts.
- Lucide icons.

Keep the visual tone pragmatic and student-facing. Avoid moralising language and avoid calorie-target framing.

## Dormant React Router Frontend

Files:

- `src/app/router.tsx`
- `src/pages/LandingPage.tsx`
- `src/pages/DeadlineSetupPage.tsx`
- `src/pages/StrategySelectionPage.tsx`
- `src/pages/PlanDashboardPage.tsx`
- `src/pages/RescuePage.tsx`
- `src/pages/FallbackBrowsePage.tsx`
- `src/pages/RecipePage.tsx`
- `src/components/deadline-food/*.tsx`
- `src/state/DeadlineModeProvider.tsx`

This tree:

- Uses React Router routes.
- Loads bootstrap data from the Fed Up API.
- Uses pure `src/domain` planner logic.
- Implements the spec's strategy comparison and rescue route.

To mount it intentionally, `src/App.tsx` would need to import and render `AppRouter`. If doing that, update e2e tests because current tests target the active prototype's copy and hash flow.

## Frontend Testing

Active e2e:

- `e2e/deadline-flow.spec.ts`

This exercises:

- Landing.
- Onboarding.
- Dashboard.
- Plan.
- Recipe detail.
- Meal swap.
- Recipes screen.
- Returning anonymous session behaviour.

Unit tests under `src/prototype/*.test.ts` cover:

- Ingredients.
- Nutrition estimate helpers.
- Session persistence.
- Shopping.

Run:

```sh
bun run test:unit
bun run test:e2e
```

## Frontend Change Checklist

Before changing frontend code:

1. Confirm active prototype or dormant router target.
2. Read the relevant screen and helper files.
3. Keep state shape changes reflected in tests and session schema if persisted.
4. Keep budget/time impact visible around swaps.
5. Preserve accessibility labels and keyboard-friendly controls.
6. Run at least `bun run lint`, `bun run typecheck`, and targeted tests.
