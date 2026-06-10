# Graph Report - functions  (2026-06-09)

## Corpus Check
- 15 files · ~28,934 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 499 nodes · 729 edges · 33 communities (20 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e8d91881`
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

## God Nodes (most connected - your core abstractions)
1. `asRecord()` - 15 edges
2. `asRecord()` - 15 edges
3. `handleAutoPlan()` - 13 edges
4. `compilerOptions` - 12 edges
5. `boundedString()` - 12 edges
6. `boundedString()` - 12 edges
7. `handleAutoPlan()` - 12 edges
8. `scripts` - 9 edges
9. `boundedNumber()` - 9 edges
10. `boundedNumber()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `handleAutoPlan()` --calls--> `buildPlan()`  [EXTRACTED]
  src/index.ts → src/autoPlan.ts

## Communities (33 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (73): allEvents, allowedPhotoMimeTypes, anonymousSessionsRef, app_1, appData_1, appDataRef, autoPlan_1, body (+65 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (72): allowedPhotoMimeTypes, anonymousSessionsRef, AppData, appDataRef, CalendarEvent, calendarFetchIcs, calendarGoogleExchange, calendarOAuthSecrets (+64 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (26): dependencies, firebase-admin, firebase-functions, @google-cloud/functions-framework, devDependencies, eslint, eslint-config-google, eslint-plugin-import (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (14): calendarEventsToDeadlines(), Deadline, exchangeGoogleCode(), exchangeOutlookCode(), fetchGoogleEvents(), fetchOutlookEvents(), filterFutureEvents(), GoogleEvent (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.21
Nodes (16): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findNutritionProductForIngredient(), findOpenFoodFactsProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (15): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (25): asRecord(), boundedNumber(), boundedString(), boundedStringList(), callRecommenderJson(), canonicalRecommenderTags(), handleAutoPlan(), mealToAllocator() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (22): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), deaccent(), fdcNutrientValue(), fdcToProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), fetchUsdaProductForIngredient() (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (26): asRecord(), boundedNumber(), boundedString(), boundedStringList(), callRecommenderJson(), canonicalRecommenderTags(), handleAutoPlan(), mealToAllocator() (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (6): data, getAppData(), getAppData(), readRecipeReviews(), seedAppData(), seedAppData()

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (25): AllocatorMeal, ANIMAL_ALLERGENS, ANIMAL_INGREDIENT_PATTERNS, Band, BuildPlanInput, canonicalTag(), classifyEffort(), DAIRY_ALLERGENS (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.06
Nodes (28): batchMeal, breakfast, busyDinner, cheap, cook, costly, days, dinner (+20 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (20): ANIMAL_ALLERGENS, ANIMAL_INGREDIENT_PATTERNS, buildPlan(), canonicalTag(), canonicalTags(), DAIRY_ALLERGENS, DAIRY_INGREDIENT_PATTERNS, GLUTEN_INGREDIENT_PATTERNS (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (11): autoPlan_1, batchMeal, breakfast, bun_test_1, busyDinner, cook, dinner, minimalMeal (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (5): appRecipes, canonicalConstraints, deadlineBootstrap, productMeta, seededMeals

### Community 26 - "Community 26"
Cohesion: 0.40
Nodes (6): buildPlan(), canonicalTags(), hasAnyAllergen(), hasAnyIngredient(), hasTag(), isDietCompatible()

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (5): deaccent(), fdcNutrientValue(), fdcToProduct(), fetchUsdaProductForIngredient(), searchFdcFoods()

### Community 28 - "Community 28"
Cohesion: 0.50
Nodes (4): enrichRecommendedRecipes(), proxyRecommenderRecommendations(), proxyRecommenderRequest(), rejectUnsupportedRecommenderMethod()

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (4): enrichRecommendedRecipes(), proxyRecommenderRecommendations(), proxyRecommenderRequest(), rejectUnsupportedRecommenderMethod()

## Knowledge Gaps
- **252 isolated node(s):** `include`, `name`, `lint`, `build`, `build:watch` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildPlan()` connect `Community 26` to `Community 8`, `Community 1`, `Community 12`, `Community 22`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `appRecipes` connect `Community 25` to `Community 1`, `Community 22`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `include`, `name`, `lint` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.023255813953488372 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.023255813953488372 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12280701754385964 - nodes in this community are weakly interconnected._