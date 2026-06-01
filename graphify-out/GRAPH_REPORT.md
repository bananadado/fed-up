# Graph Report - drp03  (2026-06-01)

## Corpus Check
- 141 files · ~83,377 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1440 nodes · 2516 edges · 95 communities (80 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5bd267f1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 94|Community 94]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 46 edges
2. `Deadline Food Autopilot — Product and Implementation Specification` - 41 edges
3. `MealOption` - 24 edges
4. `compilerOptions` - 20 edges
5. `Card()` - 20 edges
6. `scripts` - 19 edges
7. `Development And Testing` - 18 edges
8. `useDeadlineMode()` - 17 edges
9. `recipeIngredients()` - 16 edges
10. `AI Agent Playbook` - 16 edges

## Surprising Connections (you probably didn't know these)
- `fetchOpenFoodFactsNutrition()` --calls--> `deadlineFoodEndpointUrl()`  [EXTRACTED]
  src/prototype/nutritionApi.ts → src/adapters/deadlineFoodApi.ts
- `pickFallback()` --calls--> `sortByPreferredFallback()`  [EXTRACTED]
  src/domain/planGenerator.ts → src/domain/constraints.ts
- `BootstrapBoundary()` --calls--> `useDeadlineMode()`  [EXTRACTED]
  src/app/router.tsx → src/state/DeadlineModeProvider.tsx
- `BudgetResult()` --calls--> `formatPence()`  [EXTRACTED]
  src/pages/RescuePage.tsx → src/components/deadline-food/format.ts
- `createDefaultForm()` --calls--> `createIngredientDraft()`  [EXTRACTED]
  src/prototype/screens/RecipesHubScreen.tsx → src/prototype/ingredients.ts

## Communities (95 total, 15 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (71): BootstrapBoundary(), createDeadlineModeCommands(), DeadlineModeCommands, DeadlineModeState, initialDeadlineModeState, createEventBus(), EventBus, BudgetCard() (+63 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (48): allEvents, anonymousSessionsRef, app_1, body, calendarOAuthSecrets, calendarUtils_1, cookingAdjectives, crypto_1 (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (48): anonymousSessionsRef, CalendarEvent, calendarFetchIcs, calendarGoogleExchange, calendarOAuthSecrets, calendarOutlookExchange, calendarSubscriptionRefresh, CalendarToken (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (45): appNodeEnv(), configuredBackend(), DeadlineEndpoint, deadlineFoodEndpointUrl(), fetchCanonicalScenario(), fetchDeadlineBootstrap(), fetchSeededMeals(), firebaseFunctionNames (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (44): App calls local API but you expected Firebase, Backend Deployment, Build, CI Pipeline, code:sh (bun install), code:sh (bun run test:unit), code:sh (bun test src/prototype/shopping.test.ts), code:sh (bun run test:domain) (+36 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (24): formatIngredient(), ingredientKey(), recipeIngredients(), KitchenAccess, MealOption, MealType, PlannedMeal, RecipeDetails (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (43): code:block10 (You are a graphify extraction subagent. Read the files liste), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (mkdir -p graphify-out), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c ") (+35 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (40): Anonymous Session, API Change Checklist, API Contracts, Bootstrap, Canonical Scenario, code:ts (type DeadlineEndpoint =), code:ts (PlanningConstraints), code:json ({) (+32 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (36): `anonymousSessions/{sessionId}`, Backend Change Checklist, Backend Deploy, Backend Security Notes, code:rules (match /{document=**} {), code:regex (^[A-Za-z0-9_-]{16,80}$), code:ts ({), code:ts ({) (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (34): code:block1 (/graphify                                             # full), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (if [ ! -f graphify-out/.graphify_extract.json ]; then), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c ") (+26 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (28): IngredientEditor(), clamp(), countableUnits, createIngredientDraft(), formatQuantityForInput(), ingredientAliases, IngredientDraft, ingredientDraftsFromIngredients() (+20 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (28): canCook(), canPrepareBase(), createPlannedMealId(), dayLabels, formatDayLabel(), formatMealSlotLabel(), formatPlanItemLabel(), getContextTags() (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (30): AI Agent Playbook, Choosing The Correct Frontend Surface, code:sh (bun run lint), code:sh (bun run lint), code:sh (bun run lint), code:sh (bun run test:domain), code:sh (bun run firebase:data), code:sh (bun run verify) (+22 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (21): RecipeIngredient, seedMeals, formatIngredient(), pluraliseIngredientName(), sanitiseIngredientDrafts(), fetchOpenFoodFactsNutrition(), Meal, Nutrition (+13 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (21): AppButton(), appButtonClasses, AppButtonVariant, badgeTones, ChoiceGroup(), Field(), SelectField(), Tone (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (27): Active Components, Active Frontend, Active Prototype Data Model, Active Prototype Helpers, Active Prototype Navigation, Active Prototype Screens, Active Prototype State, Analytics (+19 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (21): DeadlineModeAction, DeadlineModeInternalAction, deadlineModeReducer(), withEvent(), sortByPreferredFallback(), validateConstraints(), constraints, expectedTotal (+13 more)

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (26): dependencies, firebase-admin, firebase-functions, @google-cloud/functions-framework, devDependencies, eslint, eslint-config-google, eslint-plugin-import (+18 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (17): sessionLoaded, defaultDeadlines, initialPlan, initialPreferences, DeadlineFoodPrototype(), isAppScreen(), onboardingScreens, screens (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (24): Active Surface: Prototype, Architectural Risk Areas, Architecture, Backend Surfaces, Browser Entry, Build Architecture, code:sh (bun --hot src/index.ts), code:html (<script type="module" src="./frontend.tsx" async></script>) (+16 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (15): icsSubscriptionHints, importFromSubscriptionUrl(), isSubscriptionUrl(), normalizeWebcalUrl(), parseICSText(), unfoldLines(), calendarEventsToDeadlines(), CalendarEvent (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (23): Active Prototype Model, Active Prototype Nutrition Logic, Active Prototype Plan Logic, Active Prototype Seed Data, Active Prototype Workload Logic, Anonymous Session Schema, code:ts (type MealType = "cook" | "remix" | "fallback";), code:ts (type MealType = "prep_base" | "remix" | "quick_cook" | "fall) (+15 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection, moduleResolution (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (17): currentItemKeys(), readStoredCheckedItems(), ShoppingListCard(), writeStoredCheckedItems(), aggregateIngredients(), formatShoppingList(), GroceryVendor, groceryVendors (+9 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (21): 1. Active Prototype (what users see), 2. Dormant React Router Slice (not mounted), Anonymous Session Persistence, API Endpoints, Backend, CI/Deployment, code:sh (bun install                  # install dependencies), code:sh (bun run lint                 # ESLint) (+13 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (16): AnalyticsProperties, AnalyticsProperty, capturePostHogEvent(), compactProperties(), host, posthog, registerPostHogContext(), registerPostHogSession() (+8 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (18): Anonymous Session Storage, API, code:text (anonymousSessions/{sessionId}), code:ts ({), code:http (GET /api/deadline-food/session?sessionId=<anonymous-session-), code:json ({), code:http (PUT /api/deadline-food/session), code:bash (gcloud firestore fields ttls update expiresAt \) (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (18): 0. Instructions to the Coding Agent, 11. Information Architecture and Routes, 12. Screen-Level UI Requirements, 18. Validation and Edge Cases, 20. Analytics / Evaluation Instrumentation — Prototype Level, 22. MVP Scope: What Must Be Built First, 25. Canonical Seed Scenario for Development and Testing, 26. Suggested Build Order for Codex (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (19): scripts, audit, build, dev, firebase:artifacts:setpolicy, firebase:data, firebase:deploy, firebase:dev (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (14): calendarEventsToDeadlines(), Deadline, exchangeGoogleCode(), exchangeOutlookCode(), fetchGoogleEvents(), fetchOutlookEvents(), filterFutureEvents(), GoogleEvent (+6 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.16
Nodes (11): seededMeals, canonicalConstraints, deadlineBootstrap, prototypeMeta, DeadlineBootstrap, PrototypeMeta, outdir, outfile (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (15): Active Prototype, Active Prototype Screen Summary, Backend Summary, Canonical MVP From The Spec, code:tsx (export function App() {), Core Product Behaviours, Current Implementation Snapshot, Current Quality Gates (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (15): emulators, firestore, functions, singleProjectMode, ui, firestore, database, indexes (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (16): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, firebase-tools, globals, @playwright/test (+8 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (16): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findOpenFoodFactsProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId(), openFoodFactsCategoryTerms() (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (14): code:sh (bun install), code:sh (bun run firebase:dev), code:sh (bun run firebase:deploy), Critical Implementation Reality, Current Active User Flow, Current Backend Summary, Known Gaps And Cautions, One Sentence (+6 more)

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (15): dependencies, bun-plugin-tailwind, class-variance-authority, clsx, firebase, lucide-react, posthog-js, @posthog/react (+7 more)

### Community 38 - "Community 38"
Cohesion: 0.13
Nodes (14): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+6 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (11): BuildConfigOverrides, buildTime, cliConfig, end, entrypoints, NestedBuildConfig, outputTable, parseArgs() (+3 more)

### Community 40 - "Community 40"
Cohesion: 0.15
Nodes (13): 9.1 Design requirement, 9.2 Inputs, 9.3 Meal item model, 9.4 Strategies, 9.5 Recommended MVP rules, 9.6 Optional scoring model for later iteration, code:ts (type PlanningConstraints = {), code:ts (type MealOption = {) (+5 more)

### Community 41 - "Community 41"
Cohesion: 0.24
Nodes (13): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeCalendarEvent(), normalizeCalendarToken(), normalizeDeadline(), normalizeIcsSubscription() (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.24
Nodes (13): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeCalendarEvent(), normalizeCalendarToken(), normalizeDeadline(), normalizeIcsSubscription() (+5 more)

### Community 43 - "Community 43"
Cohesion: 0.21
Nodes (13): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findOpenFoodFactsProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId(), openFoodFactsCategoryTerms() (+5 more)

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (11): days, Screen, cookingEffortReason(), workloadLabel(), workloadScore(), CalendarScreen(), DeadlineEditPanel(), FormErrors (+3 more)

### Community 45 - "Community 45"
Cohesion: 0.23
Nodes (10): estimateIngredientNutrition(), gramsForIngredient(), IngredientNutritionEstimate, OpenFoodFactsProduct, roundMacro(), servingGrams, estimate, nutrition (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.20
Nodes (9): Anonymous session storage, bun-react-tailwind-shadcn-template, code:bash (bun install), code:bash (bun dev), code:bash (bun start), code:bash (bun run verify), code:bash (FIREBASE_PROJECT_ID=your-firebase-project-id), code:bash (PROJECT_ID=your-firebase-project-id) (+1 more)

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (7): buildCommand, git, deploymentEnabled, installCommand, outputDirectory, rewrites, $schema

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (7): 8.1 Deadline setup, 8.2 Strategy selection, 8.3 Plan generation and display, 8.4 Dynamic rescue, 8.5 Fallback catalogue, 8.6 Authentication and persistence, 8. Functional Requirements

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (6): 15.1 State required for MVP, 15.2 Recommended approach, 15.3 Core plan types, 15. State Management, code:ts (type DeadlineModeState = {), code:ts (type PlannedMeal = {)

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (6): 7.4 Flow D — “I Have Even Less Time Today” Rescue Interaction, Behaviour, Example result text, Failure condition, Purpose, Trigger

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (6): 1. Prep Once, 2. Mixed Mode, 3. No-Cook Rescue, 7.2 Flow B — Select a Deadline Strategy, Required information per strategy, Required strategies

### Community 54 - "Community 54"
Cohesion: 0.33
Nodes (6): data, getPrototypeData(), parseCachedProduct(), readOpenFoodFactsCachedProduct(), seedPrototypeData(), timestampMillis()

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (5): 10.1 Seed data, 10.2 Illustrative fallback examples, 10.3 Nutrition representation, 10. Content and Data Requirements, code:ts (const fallbackOptions: MealOption[] = [)

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (5): 16.1 Authentication, 16.2 Suggested Firestore collections, 16.3 MVP recommendation, 16. Firebase Data Model — Optional Persistence Layer, code:text (users/{uid})

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (5): 1.1 Opportunity statement, 1.2 Product proposition, 1.3 One-sentence concept, 1.4 What makes the concept distinctive, 1. Product Summary

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (5): 23. Later Enhancements — Explicitly Deferred, Explicitly optional social extension, Phase 2: Increased realism, Phase 3: Institution/provider integration, Phase 4: Advanced personalisation

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (5): 7.3 Flow C — View the Weekly Plan, Interaction requirements, Purpose, Required plan content, Required plan summary

### Community 60 - "Community 60"
Cohesion: 0.40
Nodes (5): 14.1 Existing project direction, 14.2 MVP architectural principle, 14.3 Recommended module separation, 14. Technical Stack and Architectural Assumptions, code:text (src/)

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (5): 7.1 Flow A — Enter Deadline Mode, Entry mechanisms, Purpose, Required interaction, UX requirement

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (4): Enabled PostHog Features, Instrumented Events, Journey Dimensions, PostHog setup report

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): canonicalConstraints, deadlineBootstrap, prototypeMeta, seededMeals

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (4): 19.1 Domain/unit tests — required, 19.2 UI/integration tests — desirable, 19.3 Manual user-test readiness, 19. Testing Requirements

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (4): 24. Acceptance Criteria for the Initial Implementation, Demonstration readiness, Engineering quality, Product behaviour

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (4): 4.1 Primary goals, 4.2 Non-goals for the MVP, 4.3 Product success indicators for prototype testing, 4. Goals, Non-Goals and Success Criteria

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (4): 17.1 Required functions, 17.2 Invariants, 17. Pure Domain Logic Requirements, code:ts (function validateConstraints(input: PlanningConstraints): Va)

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (3): 12.1 Landing / activation screen, Must include, Suggested copy

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (3): 12.2 Deadline Mode setup screen, Design requirements, Must include controls for

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): 12.4 Plan dashboard screen, Highlight, Must include

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (3): 12.5 Rescue substitution UI, Must include, Tone

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (3): 13. UX and Visual Design Principles, Avoid, Required principles

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (3): 21.1 Accessibility, 21.2 Responsible food guidance, 21. Accessibility and Responsible Design Requirements

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (3): 5.1 Primary user: student under deadline pressure, 5.2 Secondary stakeholders, 5. Target Users and Stakeholders

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): 6.1 Experience principle, 6.2 Primary end-to-end demonstration scenario, 6. Core User Experience

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (3): 12.3 Strategy comparison screen, Important, Must include

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (3): 7.5 Flow E — Campus Fallback Details, MVP data approach, Required functionality

## Knowledge Gaps
- **673 isolated node(s):** `$schema`, `buildCommand`, `installCommand`, `outputDirectory`, `deploymentEnabled` (+668 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 0` to `Community 10`, `Community 44`, `Community 14`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `RecipeIngredient` connect `Community 13` to `Community 5`, `Community 10`, `Community 45`, `Community 20`, `Community 23`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `Card()` connect `Community 0` to `Community 11`, `Community 13`, `Community 14`, `Community 23`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `$schema`, `buildCommand`, `installCommand` to the rest of the system?**
  _673 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05804132973944295 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03508771929824561 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03831168831168831 - nodes in this community are weakly interconnected._