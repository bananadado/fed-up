# Graph Report - functions  (2026-06-10)

## Corpus Check
- 15 files · ~29,574 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 474 nodes · 669 edges · 30 communities (19 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0582357d`
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

## God Nodes (most connected - your core abstractions)
1. `asRecord()` - 14 edges
2. `asRecord()` - 14 edges
3. `handleAutoPlan()` - 13 edges
4. `compilerOptions` - 12 edges
5. `handleAutoPlan()` - 12 edges
6. `boundedString()` - 11 edges
7. `boundedString()` - 11 edges
8. `scripts` - 9 edges
9. `boundedNumber()` - 8 edges
10. `normalizeSessionSettings()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `handleAutoPlan()` --calls--> `buildPlan()`  [EXTRACTED]
  src/index.ts → src/autoPlan.ts

## Communities (30 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (68): allEvents, allowedPhotoMimeTypes, AppData, body, bucket, CalendarEvent, calendarOAuthSecrets, CalendarToken (+60 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (67): allEvents, allowedPhotoMimeTypes, anonymousSessionsRef, app_1, appData_1, appDataRef, autoPlan_1, body (+59 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (31): AllocatorMeal, ANIMAL_ALLERGENS, ANIMAL_INGREDIENT_PATTERNS, Band, buildPlan(), BuildPlanInput, canonicalTag(), canonicalTags() (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (28): batchMeal, breakfast, busyDinner, cheap, cook, costly, days, dinner (+20 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (20): ANIMAL_ALLERGENS, ANIMAL_INGREDIENT_PATTERNS, buildPlan(), canonicalTag(), canonicalTags(), DAIRY_ALLERGENS, DAIRY_INGREDIENT_PATTERNS, GLUTEN_INGREDIENT_PATTERNS (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (26): dependencies, firebase-admin, firebase-functions, @google-cloud/functions-framework, devDependencies, eslint, eslint-config-google, eslint-plugin-import (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (24): asRecord(), boundedNumber(), boundedString(), boundedStringList(), callRecommenderJson(), canonicalRecommenderTags(), handleAutoPlan(), mealToAllocator() (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (24): asRecord(), boundedNumber(), boundedString(), boundedStringList(), callRecommenderJson(), canonicalRecommenderTags(), handleAutoPlan(), mealToAllocator() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (14): calendarEventsToDeadlines(), Deadline, exchangeGoogleCode(), exchangeOutlookCode(), fetchGoogleEvents(), fetchOutlookEvents(), filterFutureEvents(), GoogleEvent (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (15): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (11): autoPlan_1, batchMeal, breakfast, bun_test_1, busyDinner, cook, dinner, minimalMeal (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (14): cacheOpenFoodFactsProduct(), deaccent(), fdcNutrientValue(), fdcToProduct(), fetchUsdaProductForIngredient(), findNutritionProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId() (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (14): cacheOpenFoodFactsProduct(), deaccent(), fdcNutrientValue(), fdcToProduct(), fetchUsdaProductForIngredient(), findNutritionProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (10): accountSessionDocId(), accountSessionHandle(), data, getAppData(), handleAccountSessionDelete(), handleAccountSessionGet(), readRecipeReviews(), seedAppData() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (5): appRecipes, canonicalConstraints, deadlineBootstrap, productMeta, seededMeals

### Community 17 - "Community 17"
Cohesion: 0.50
Nodes (4): enrichRecommendedRecipes(), proxyRecommenderRecommendations(), proxyRecommenderRequest(), rejectUnsupportedRecommenderMethod()

### Community 18 - "Community 18"
Cohesion: 0.50
Nodes (4): data, getAppData(), readRecipeReviews(), seedAppData()

### Community 19 - "Community 19"
Cohesion: 0.50
Nodes (4): enrichRecommendedRecipes(), proxyRecommenderRecommendations(), proxyRecommenderRequest(), rejectUnsupportedRecommenderMethod()

## Knowledge Gaps
- **242 isolated node(s):** `include`, `name`, `lint`, `build`, `build:watch` (+237 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildPlan()` connect `Community 2` to `Community 0`, `Community 3`, `Community 7`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `appRecipes` connect `Community 16` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `include`, `name`, `lint` to the rest of the system?**
  _242 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.024691358024691357 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.025 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06401137980085349 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._