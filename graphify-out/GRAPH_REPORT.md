# Graph Report - .  (2026-05-29)

## Corpus Check
- 120 files · ~52,380 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 764 nodes · 1703 edges · 36 communities (29 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Prototype UI Shell|Prototype UI Shell]]
- [[_COMMUNITY_Router And Pages|Router And Pages]]
- [[_COMMUNITY_Deadline Mode State|Deadline Mode State]]
- [[_COMMUNITY_Seed Data Session API|Seed Data Session API]]
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
- [[_COMMUNITY_Ingredient Label|Ingredient Label]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 46 edges
2. `MealOption` - 24 edges
3. `compilerOptions` - 20 edges
4. `Card()` - 20 edges
5. `scripts` - 19 edges
6. `useDeadlineMode()` - 17 edges
7. `recipeIngredients()` - 16 edges
8. `money()` - 14 edges
9. `Button()` - 14 edges
10. `formatPence()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Opaque Session ID` --references--> `getOrCreateAnonymousSessionId()`  [INFERRED]
  docs/anonymous-session-storage.md → src/prototype/anonymousSessionApi.ts
- `Rescue Substitution` --references--> `PlanScreen()`  [INFERRED]
  DEADLINE_FOOD_AUTOPILOT_SPEC.md → src/prototype/screens/PlanScreen.tsx
- `Rescue Substitution` --references--> `RescuePage()`  [INFERRED]
  DEADLINE_FOOD_AUTOPILOT_SPEC.md → src/pages/RescuePage.tsx
- `Prep Once Strategy` --references--> `buildPrepOncePlan()`  [INFERRED]
  DEADLINE_FOOD_AUTOPILOT_SPEC.md → src/domain/planGenerator.ts
- `Mixed Mode Strategy` --references--> `buildMixedPlan()`  [INFERRED]
  DEADLINE_FOOD_AUTOPILOT_SPEC.md → src/domain/planGenerator.ts

## Hyperedges (group relationships)
- **Deadline Food Strategy Flow** — deadline_food_autopilot_spec_prep_once, deadline_food_autopilot_spec_mixed_mode, deadline_food_autopilot_spec_no_cook_rescue, domain_plangenerator_generateplan, pages_strategyselectionpage_strategyselectionpage [INFERRED 0.85]
- **Anonymous Session Persistence Loop** — anonymous_session_storage_opaque_session_id, anonymous_session_storage_deadline_food_session_api, anonymous_session_storage_firestore_record, prototype_anonymoussessionapi_saveanonymoussessionsettings, src_index_deadlinefoodsession [INFERRED 0.85]
- **Release Quality Gate** — gitlab_ci_pipeline_quality_gate, readme_bun_verification_workflow, drp03_package_scripts_verify, drp03_package_scripts_build, gitlab_ci_staging_production_deploy [INFERRED 0.75]

## Communities (36 total, 7 thin omitted)

### Community 0 - "Prototype UI Shell"
Cohesion: 0.06
Nodes (76): BudgetCard(), AppButton(), Badge(), ChoiceGroup(), Shell(), currentItemKeys(), readStoredCheckedItems(), ShoppingListCard() (+68 more)

### Community 1 - "Router And Pages"
Cohesion: 0.09
Nodes (53): BootstrapBoundary(), appButtonClasses, AppButtonVariant, badgeTones, SelectField(), Tone, Campus Fallback Catalogue, Rescue Substitution (+45 more)

### Community 2 - "Deadline Mode State"
Cohesion: 0.05
Nodes (68): createDeadlineModeCommands(), DeadlineModeAction, DeadlineModeCommands, DeadlineModeInternalAction, deadlineModeReducer(), DeadlineModeState, initialDeadlineModeState, withEvent() (+60 more)

### Community 3 - "Seed Data Session API"
Cohesion: 0.08
Nodes (39): Deadline Food Session API, seededMeals, canonicalConstraints, deadlineBootstrap, prototypeMeta, Canonical Seed Scenario, formatIngredient(), ingredientKey() (+31 more)

### Community 4 - "Ingredient Editing"
Cohesion: 0.08
Nodes (41): IngredientEditor(), Field(), clamp(), countableUnits, createIngredientDraft(), formatIngredient(), formatQuantityForInput(), ingredientAliases (+33 more)

### Community 5 - "API Adapter"
Cohesion: 0.11
Nodes (32): appNodeEnv(), configuredBackend(), DeadlineEndpoint, deadlineFoodEndpointUrl(), fetchCanonicalScenario(), fetchDeadlineBootstrap(), fetchSeededMeals(), firebaseFunctionNames (+24 more)

### Community 6 - "Firebase Functions"
Cohesion: 0.06
Nodes (30): cookingAdjectives, deadlineFoodBootstrap, deadlineFoodMeals, deadlineFoodNutrition, deadlineFoodScenario, firestore, getPrototypeData(), HttpRequest (+22 more)

### Community 7 - "Package Scripts"
Cohesion: 0.06
Nodes (33): Bun First Tooling, scripts, audit, build, dev, firebase:artifacts:setpolicy, firebase:data, firebase:deploy (+25 more)

### Community 8 - "Compiled Session Backend"
Cohesion: 0.08
Nodes (27): anonymousSessionsRef, app_1, asRecord(), body, boundedNumber(), boundedString(), boundedStringList(), crypto_1 (+19 more)

### Community 9 - "PostHog Analytics"
Cohesion: 0.09
Nodes (22): AnalyticsProperty, capturePostHogEvent(), compactProperties(), host, posthog, registerPostHogContext(), registerPostHogSession(), token (+14 more)

### Community 10 - "Functions Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, firebase-admin, firebase-functions, @google-cloud/functions-framework, devDependencies, eslint, eslint-config-google, eslint-plugin-import (+18 more)

### Community 11 - "App TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection, moduleResolution (+14 more)

### Community 12 - "Shadcn Component Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 13 - "App Dev Dependencies"
Cohesion: 0.12
Nodes (16): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, firebase-tools, globals, @playwright/test (+8 more)

### Community 14 - "App Runtime Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bun-plugin-tailwind, class-variance-authority, clsx, firebase, lucide-react, posthog-js, @posthog/react (+7 more)

### Community 15 - "Functions TypeScript Config"
Cohesion: 0.13
Nodes (14): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+6 more)

### Community 16 - "Build Script"
Cohesion: 0.18
Nodes (11): BuildConfigOverrides, buildTime, cliConfig, end, entrypoints, NestedBuildConfig, outputTable, parseArgs() (+3 more)

### Community 17 - "Nutrition Estimation"
Cohesion: 0.21
Nodes (11): estimateIngredientNutrition(), gramsForIngredient(), IngredientNutritionEstimate, OpenFoodFactsProduct, roundMacro(), servingGrams, estimate, nutrition (+3 more)

### Community 18 - "OpenFoodFacts Cache"
Cohesion: 0.25
Nodes (11): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findOpenFoodFactsProductForIngredient(), openFoodFactsCacheDocId(), readOpenFoodFactsCachedProduct(), sleep() (+3 more)

### Community 19 - "Firebase Emulator Config"
Cohesion: 0.22
Nodes (9): emulators, firestore, functions, singleProjectMode, ui, port, port, enabled (+1 more)

### Community 20 - "Firebase Project Config"
Cohesion: 0.25
Nodes (7): React Bun Firebase Stack, firestore, database, indexes, location, rules, functions

### Community 21 - "Backend Normalizers"
Cohesion: 0.29
Nodes (8): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeDeadline(), normalizePrototypeSessionSettings(), parseCachedProduct(), readRequestBody()

### Community 22 - "Anonymous Session Storage"
Cohesion: 0.29
Nodes (7): Account Migration Path, Anonymous Session Storage, Firestore Anonymous Session Record, Opaque Session ID, Rolling 90 Day TTL, anonymousSessionsRef, sessionExpiryTimestamp()

### Community 23 - "Package Metadata"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 24 - "Generated Prototype Data"
Cohesion: 0.40
Nodes (4): canonicalConstraints, deadlineBootstrap, prototypeMeta, seededMeals

### Community 25 - "Ingredient Taxonomy"
Cohesion: 0.50
Nodes (4): normalizeIngredientKey(), openFoodFactsCategoryTerms(), toCategoryTag(), uniqueTerms()

## Ambiguous Edges - Review These
- `App.tsx` → `Empty Logo Asset`  [AMBIGUOUS]
  src/logo.svg · relation: references

## Knowledge Gaps
- **262 isolated node(s):** `indexes`, `fieldOverrides`, `database`, `location`, `rules` (+257 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `App.tsx` and `Empty Logo Asset`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `Deadline Food Session API` connect `Seed Data Session API` to `Anonymous Session Storage`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `deadlineFoodSession` connect `Seed Data Session API` to `Firebase Functions`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `getOrCreateAnonymousSessionId()` connect `API Adapter` to `Prototype UI Shell`, `PostHog Analytics`, `Anonymous Session Storage`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `indexes`, `fieldOverrides`, `database` to the rest of the system?**
  _265 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Prototype UI Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.05619865571321882 - nodes in this community are weakly interconnected._
- **Should `Router And Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.08611863896416742 - nodes in this community are weakly interconnected._