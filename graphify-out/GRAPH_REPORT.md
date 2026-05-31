# Graph Report - drp03  (2026-05-31)

## Corpus Check
- 136 files · ~76,034 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1334 nodes · 2333 edges · 99 communities (84 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cc01e1a4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Prototype UI Shell|Prototype UI Shell]]
- [[_COMMUNITY_Router And Pages|Router And Pages]]
- [[_COMMUNITY_Deadline Mode State|Deadline Mode State]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Ingredient Editing|Ingredient Editing]]
- [[_COMMUNITY_API Adapter|API Adapter]]
- [[_COMMUNITY_Firebase Functions|Firebase Functions]]
- [[_COMMUNITY_Package Scripts|Package Scripts]]
- [[_COMMUNITY_Compiled Session Backend|Compiled Session Backend]]
- [[_COMMUNITY_PostHog Analytics|PostHog Analytics]]
- [[_COMMUNITY_Functions Dependencies|Functions Dependencies]]
- [[_COMMUNITY_App TypeScript Config|App TypeScript Config]]
- [[_COMMUNITY_Shadcn Component Config|Shadcn Component Config]]
- [[_COMMUNITY_App Dev Dependencies|App Dev Dependencies]]
- [[_COMMUNITY_App Runtime Dependencies|App Runtime Dependencies]]
- [[_COMMUNITY_Functions TypeScript Config|Functions TypeScript Config]]
- [[_COMMUNITY_Build Script|Build Script]]
- [[_COMMUNITY_Nutrition Estimation|Nutrition Estimation]]
- [[_COMMUNITY_OpenFoodFacts Cache|OpenFoodFacts Cache]]
- [[_COMMUNITY_Firebase Emulator Config|Firebase Emulator Config]]
- [[_COMMUNITY_Firebase Project Config|Firebase Project Config]]
- [[_COMMUNITY_Backend Normalizers|Backend Normalizers]]
- [[_COMMUNITY_Anonymous Session Storage|Anonymous Session Storage]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Generated Prototype Data|Generated Prototype Data]]
- [[_COMMUNITY_Ingredient Taxonomy|Ingredient Taxonomy]]
- [[_COMMUNITY_Firestore Indexes|Firestore Indexes]]
- [[_COMMUNITY_Firebase Local Dev|Firebase Local Dev]]
- [[_COMMUNITY_Playwright Config|Playwright Config]]
- [[_COMMUNITY_Functions Dev TSConfig|Functions Dev TSConfig]]
- [[_COMMUNITY_Audit Script|Audit Script]]
- [[_COMMUNITY_Nutrition Helpers|Nutrition Helpers]]
- [[_COMMUNITY_Bun Environment Types|Bun Environment Types]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Functions ESLint Config|Functions ESLint Config]]
- [[_COMMUNITY_Ingredient Label|Ingredient Label]]
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
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 98|Community 98]]

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
- `pickFallback()` --calls--> `sortByPreferredFallback()`  [EXTRACTED]
  src/domain/planGenerator.ts → src/domain/constraints.ts
- `BootstrapBoundary()` --calls--> `useDeadlineMode()`  [EXTRACTED]
  src/app/router.tsx → src/state/DeadlineModeProvider.tsx
- `BudgetResult()` --calls--> `formatPence()`  [EXTRACTED]
  src/pages/RescuePage.tsx → src/components/deadline-food/format.ts
- `createDefaultForm()` --calls--> `createIngredientDraft()`  [EXTRACTED]
  src/prototype/screens/RecipesHubScreen.tsx → src/prototype/ingredients.ts
- `priceDiff()` --calls--> `money()`  [EXTRACTED]
  src/prototype/screens/PlanScreen.tsx → src/prototype/utils.ts

## Communities (99 total, 15 thin omitted)

### Community 0 - "Prototype UI Shell"
Cohesion: 0.05
Nodes (78): BudgetCard(), IngredientEditor(), AppButton(), Badge(), currentItemKeys(), readStoredCheckedItems(), ShoppingListCard(), writeStoredCheckedItems() (+70 more)

### Community 1 - "Router And Pages"
Cohesion: 0.05
Nodes (68): icsSubscriptionHints, importFromSubscriptionUrl(), isSubscriptionUrl(), normalizeWebcalUrl(), fetchEvents(), GoogleEvent, importGoogleCalendar(), isGoogleConfigured() (+60 more)

### Community 2 - "Deadline Mode State"
Cohesion: 0.09
Nodes (50): BootstrapBoundary(), appButtonClasses, AppButtonVariant, badgeTones, Field(), SelectField(), Tone, BudgetSummary() (+42 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (44): App calls local API but you expected Firebase, Backend Deployment, Build, CI Pipeline, code:sh (bun install), code:sh (bun run test:unit), code:sh (bun test src/prototype/shopping.test.ts), code:sh (bun run test:domain) (+36 more)

### Community 4 - "Ingredient Editing"
Cohesion: 0.09
Nodes (39): appNodeEnv(), configuredBackend(), DeadlineEndpoint, deadlineFoodEndpointUrl(), fetchCanonicalScenario(), fetchDeadlineBootstrap(), fetchSeededMeals(), firebaseFunctionNames (+31 more)

### Community 5 - "API Adapter"
Cohesion: 0.05
Nodes (40): Anonymous Session, API Change Checklist, API Contracts, Bootstrap, Canonical Scenario, code:ts (type DeadlineEndpoint =), code:ts (PlanningConstraints), code:json ({) (+32 more)

### Community 6 - "Firebase Functions"
Cohesion: 0.13
Nodes (20): formatIngredient(), ingredientKey(), recipeIngredients(), MealOption, RecipeIngredient, fallbackCampusHummusBox, fallbackCampusRiceBowl, fallbackCampusSushiSnack (+12 more)

### Community 7 - "Package Scripts"
Cohesion: 0.05
Nodes (36): `anonymousSessions/{sessionId}`, Backend Change Checklist, Backend Deploy, Backend Security Notes, code:rules (match /{document=**} {), code:regex (^[A-Za-z0-9_-]{16,80}$), code:ts ({), code:ts ({) (+28 more)

### Community 8 - "Compiled Session Backend"
Cohesion: 0.06
Nodes (27): anonymousSessionsRef, app_1, body, cookingAdjectives, crypto_1, estimateIngredientNutrition(), estimates, expiresAt (+19 more)

### Community 9 - "PostHog Analytics"
Cohesion: 0.06
Nodes (28): anonymousSessionsRef, cookingAdjectives, deadlineFoodBootstrap, deadlineFoodMeals, deadlineFoodNutrition, deadlineFoodScenario, deadlineFoodSession, firestore (+20 more)

### Community 10 - "Functions Dependencies"
Cohesion: 0.06
Nodes (30): AI Agent Playbook, Choosing The Correct Frontend Surface, code:sh (bun run lint), code:sh (bun run lint), code:sh (bun run lint), code:sh (bun run test:domain), code:sh (bun run firebase:data), code:sh (bun run verify) (+22 more)

### Community 11 - "App TypeScript Config"
Cohesion: 0.17
Nodes (28): canCook(), canPrepareBase(), createPlannedMealId(), dayLabels, formatDayLabel(), formatMealSlotLabel(), formatPlanItemLabel(), getContextTags() (+20 more)

### Community 12 - "Shadcn Component Config"
Cohesion: 0.07
Nodes (27): Active Components, Active Frontend, Active Prototype Data Model, Active Prototype Helpers, Active Prototype Navigation, Active Prototype Screens, Active Prototype State, Analytics (+19 more)

### Community 13 - "App Dev Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, firebase-admin, firebase-functions, @google-cloud/functions-framework, devDependencies, eslint, eslint-config-google, eslint-plugin-import (+18 more)

### Community 14 - "App Runtime Dependencies"
Cohesion: 0.08
Nodes (24): Active Surface: Prototype, Architectural Risk Areas, Architecture, Backend Surfaces, Browser Entry, Build Architecture, code:sh (bun --hot src/index.ts), code:html (<script type="module" src="./frontend.tsx" async></script>) (+16 more)

### Community 15 - "Functions TypeScript Config"
Cohesion: 0.08
Nodes (23): Active Prototype Model, Active Prototype Nutrition Logic, Active Prototype Plan Logic, Active Prototype Seed Data, Active Prototype Workload Logic, Anonymous Session Schema, code:ts (type MealType = "cook" | "remix" | "fallback";), code:ts (type MealType = "prep_base" | "remix" | "quick_cook" | "fall) (+15 more)

### Community 16 - "Build Script"
Cohesion: 0.08
Nodes (24): code:bash (mkdir -p graphify-out), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (# Detect the correct Python interpreter (handles uv tool, pi), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c ") (+16 more)

### Community 17 - "Nutrition Estimation"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection, moduleResolution (+14 more)

### Community 18 - "OpenFoodFacts Cache"
Cohesion: 0.12
Nodes (16): AnalyticsProperties, AnalyticsProperty, capturePostHogEvent(), compactProperties(), host, posthog, registerPostHogContext(), registerPostHogSession() (+8 more)

### Community 19 - "Firebase Emulator Config"
Cohesion: 0.15
Nodes (16): createDeadlineModeCommands(), DeadlineModeAction, DeadlineModeCommands, DeadlineModeInternalAction, deadlineModeReducer(), DeadlineModeState, initialDeadlineModeState, withEvent() (+8 more)

### Community 20 - "Firebase Project Config"
Cohesion: 0.11
Nodes (18): 0. Instructions to the Coding Agent, 11. Information Architecture and Routes, 12. Screen-Level UI Requirements, 18. Validation and Edge Cases, 20. Analytics / Evaluation Instrumentation — Prototype Level, 22. MVP Scope: What Must Be Built First, 25. Canonical Seed Scenario for Development and Testing, 26. Suggested Build Order for Codex (+10 more)

### Community 21 - "Backend Normalizers"
Cohesion: 0.11
Nodes (18): Anonymous Session Storage, API, code:text (anonymousSessions/{sessionId}), code:ts ({), code:http (GET /api/deadline-food/session?sessionId=<anonymous-session-), code:json ({), code:http (PUT /api/deadline-food/session), code:bash (gcloud firestore fields ttls update expiresAt \) (+10 more)

### Community 22 - "Anonymous Session Storage"
Cohesion: 0.11
Nodes (19): scripts, audit, build, dev, firebase:artifacts:setpolicy, firebase:data, firebase:deploy, firebase:dev (+11 more)

### Community 23 - "Package Metadata"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 24 - "Generated Prototype Data"
Cohesion: 0.12
Nodes (16): code:block1 (/graphify                                             # full), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (python3 -m graphify.watch INPUT_PATH --debounce 3), code:bash (graphify hook install    # install), code:bash (graphify claude install), code:bash (graphify claude uninstall  # remove the section), For --cluster-only (+8 more)

### Community 25 - "Ingredient Taxonomy"
Cohesion: 0.16
Nodes (11): seededMeals, canonicalConstraints, deadlineBootstrap, prototypeMeta, DeadlineBootstrap, PrototypeMeta, outdir, outfile (+3 more)

### Community 26 - "Firestore Indexes"
Cohesion: 0.12
Nodes (15): Active Prototype, Active Prototype Screen Summary, Backend Summary, Canonical MVP From The Spec, code:tsx (export function App() {), Core Product Behaviours, Current Implementation Snapshot, Current Quality Gates (+7 more)

### Community 27 - "Firebase Local Dev"
Cohesion: 0.12
Nodes (15): emulators, firestore, functions, singleProjectMode, ui, firestore, database, indexes (+7 more)

### Community 28 - "Playwright Config"
Cohesion: 0.12
Nodes (16): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, firebase-tools, globals, @playwright/test (+8 more)

### Community 29 - "Functions Dev TSConfig"
Cohesion: 0.13
Nodes (14): code:sh (bun install), code:sh (bun run firebase:dev), code:sh (bun run firebase:deploy), Critical Implementation Reality, Current Active User Flow, Current Backend Summary, Known Gaps And Cautions, One Sentence (+6 more)

### Community 30 - "Audit Script"
Cohesion: 0.13
Nodes (15): dependencies, bun-plugin-tailwind, class-variance-authority, clsx, firebase, lucide-react, posthog-js, @posthog/react (+7 more)

### Community 31 - "Nutrition Helpers"
Cohesion: 0.13
Nodes (14): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+6 more)

### Community 32 - "Bun Environment Types"
Cohesion: 0.18
Nodes (11): BuildConfigOverrides, buildTime, cliConfig, end, entrypoints, NestedBuildConfig, outputTable, parseArgs() (+3 more)

### Community 33 - "ESLint Config"
Cohesion: 0.15
Nodes (13): 9.1 Design requirement, 9.2 Inputs, 9.3 Meal item model, 9.4 Strategies, 9.5 Recommended MVP rules, 9.6 Optional scoring model for later iteration, code:ts (type PlanningConstraints = {), code:ts (type MealOption = {) (+5 more)

### Community 34 - "Functions ESLint Config"
Cohesion: 0.15
Nodes (13): code:block10 (You are a graphify extraction subagent. Read the files liste), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:block8 (spawn_agent(agent_type="worker", message="Your task is to pe) (+5 more)

### Community 35 - "Ingredient Label"
Cohesion: 0.18
Nodes (9): strategyLabels, KitchenAccess, MealType, PlannedMeal, PlanningConstraints, RankedStrategy, RecipeDetails, RescueProposal (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.21
Nodes (10): sortByPreferredFallback(), constraints, expectedTotal, plan, ranked, rescued, tightPlan, vegetarianPlan (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (11): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findOpenFoodFactsProductForIngredient(), openFoodFactsCacheDocId(), readOpenFoodFactsCachedProduct(), sleep() (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (9): Anonymous session storage, bun-react-tailwind-shadcn-template, code:bash (bun install), code:bash (bun dev), code:bash (bun start), code:bash (bun run verify), code:bash (FIREBASE_PROJECT_ID=your-firebase-project-id), code:bash (PROJECT_ID=your-firebase-project-id) (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): APIs, code:ts#index.test.ts (import { test, expect } from "bun:test";), code:ts#index.ts (import index from "./index.html"), code:html#index.html (<html>), code:tsx#frontend.tsx (import React from "react";), code:sh (bun --hot ./index.ts), Frontend, Testing

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (9): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeDeadline(), normalizePrototypeSessionSettings(), normalizeRecipeList(), parseCachedProduct() (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (9): compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), normalizeIngredientKey(), openFoodFactsCategoryTerms(), sleep(), toCategoryTag(), uniqueTerms() (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (9): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeDeadline(), normalizePrototypeSessionSettings(), normalizeRecipeList(), parseCachedProduct() (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (7): buildCommand, git, deploymentEnabled, installCommand, outputDirectory, rewrites, $schema

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (7): 8.1 Deadline setup, 8.2 Strategy selection, 8.3 Plan generation and display, 8.4 Dynamic rescue, 8.5 Fallback catalogue, 8.6 Authentication and persistence, 8. Functional Requirements

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (6): 15.1 State required for MVP, 15.2 Recommended approach, 15.3 Core plan types, 15. State Management, code:ts (type DeadlineModeState = {), code:ts (type PlannedMeal = {)

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (6): 7.4 Flow D — “I Have Even Less Time Today” Rescue Interaction, Behaviour, Example result text, Failure condition, Purpose, Trigger

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (6): 1. Prep Once, 2. Mixed Mode, 3. No-Cook Rescue, 7.2 Flow B — Select a Deadline Strategy, Required information per strategy, Required strategies

### Community 48 - "Community 48"
Cohesion: 0.53
Nodes (6): cacheOpenFoodFactsProduct(), findOpenFoodFactsProductForIngredient(), openFoodFactsCacheDocId(), readOpenFoodFactsCachedProduct(), timestampMillis(), tryAcquireOpenFoodFactsCacheLock()

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (6): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (if [ ! -f graphify-out/.graphify_extract.json ]; then), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), For --update (incremental re-extraction)

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (5): 10.1 Seed data, 10.2 Illustrative fallback examples, 10.3 Nutrition representation, 10. Content and Data Requirements, code:ts (const fallbackOptions: MealOption[] = [)

### Community 51 - "Community 51"
Cohesion: 0.40
Nodes (5): 16.1 Authentication, 16.2 Suggested Firestore collections, 16.3 MVP recommendation, 16. Firebase Data Model — Optional Persistence Layer, code:text (users/{uid})

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (5): 1.1 Opportunity statement, 1.2 Product proposition, 1.3 One-sentence concept, 1.4 What makes the concept distinctive, 1. Product Summary

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (5): 23. Later Enhancements — Explicitly Deferred, Explicitly optional social extension, Phase 2: Increased realism, Phase 3: Institution/provider integration, Phase 4: Advanced personalisation

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (5): 7.3 Flow C — View the Weekly Plan, Interaction requirements, Purpose, Required plan content, Required plan summary

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (5): 14.1 Existing project direction, 14.2 MVP architectural principle, 14.3 Recommended module separation, 14. Technical Stack and Architectural Assumptions, code:text (src/)

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (5): 7.1 Flow A — Enter Deadline Mode, Entry mechanisms, Purpose, Required interaction, UX requirement

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (4): Enabled PostHog Features, Instrumented Events, Journey Dimensions, PostHog setup report

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (4): canonicalConstraints, deadlineBootstrap, prototypeMeta, seededMeals

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (4): 17.1 Required functions, 17.2 Invariants, 17. Pure Domain Logic Requirements, code:ts (function validateConstraints(input: PlanningConstraints): Va)

### Community 61 - "Community 61"
Cohesion: 0.50
Nodes (4): 19.1 Domain/unit tests — required, 19.2 UI/integration tests — desirable, 19.3 Manual user-test readiness, 19. Testing Requirements

### Community 62 - "Community 62"
Cohesion: 0.50
Nodes (4): 4.1 Primary goals, 4.2 Non-goals for the MVP, 4.3 Product success indicators for prototype testing, 4. Goals, Non-Goals and Success Criteria

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (4): 24. Acceptance Criteria for the Initial Implementation, Demonstration readiness, Engineering quality, Product behaviour

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (4): normalizeIngredientKey(), openFoodFactsCategoryTerms(), toCategoryTag(), uniqueTerms()

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (4): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -m graphify save-result), For /graphify query

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (4): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -m graphify save-result), For /graphify path

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (4): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -m graphify save-result), For /graphify explain

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (3): 12.1 Landing / activation screen, Must include, Suggested copy

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (3): 12.2 Deadline Mode setup screen, Design requirements, Must include controls for

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (3): 12.4 Plan dashboard screen, Highlight, Must include

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): 12.5 Rescue substitution UI, Must include, Tone

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (3): 13. UX and Visual Design Principles, Avoid, Required principles

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (3): 21.1 Accessibility, 21.2 Responsible food guidance, 21. Accessibility and Responsible Design Requirements

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (3): 5.1 Primary user: student under deadline pressure, 5.2 Secondary stakeholders, 5. Target Users and Stakeholders

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (3): 6.1 Experience principle, 6.2 Primary end-to-end demonstration scenario, 6. Core User Experience

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): 12.3 Strategy comparison screen, Important, Must include

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (3): 7.5 Flow E — Campus Fallback Details, MVP data approach, Required functionality

### Community 80 - "Community 80"
Cohesion: 0.67
Nodes (3): data, getPrototypeData(), seedPrototypeData()

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (3): code:bash ($(cat graphify-out/.graphify_python) -c "), code:block27 (Graph complete. Outputs in PATH_TO_DIR/graphify-out/), Step 9 - Save manifest, update cost tracker, clean up, and report

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (3): code:bash ($(cat graphify-out/.graphify_python) -c "), code:block4 (Corpus: X files · ~Y words), Step 2 - Detect files

## Knowledge Gaps
- **622 isolated node(s):** `$schema`, `buildCommand`, `installCommand`, `outputDirectory`, `deploymentEnabled` (+617 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deadline Food Autopilot — Product and Implementation Specification` connect `Firebase Project Config` to `ESLint Config`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 50`, `Community 51`, `Community 52`, `Community 53`, `Community 54`, `Community 55`, `Community 56`, `Community 60`, `Community 61`, `Community 62`, `Community 63`, `Community 69`, `Community 70`, `Community 71`, `Community 72`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 77`, `Community 78`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `cn()` connect `Deadline Mode State` to `Prototype UI Shell`, `Router And Pages`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `RecipeIngredient` connect `Firebase Functions` to `Prototype UI Shell`, `Router And Pages`, `Ingredient Label`, `Ingredient Editing`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `$schema`, `buildCommand`, `installCommand` to the rest of the system?**
  _622 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prototype UI Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.052805280528052806 - nodes in this community are weakly interconnected._
- **Should `Router And Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.05039193729003359 - nodes in this community are weakly interconnected._
- **Should `Deadline Mode State` be split into smaller, more focused modules?**
  _Cohesion score 0.09120415449529373 - nodes in this community are weakly interconnected._