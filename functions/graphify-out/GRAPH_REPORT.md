# Graph Report - functions  (2026-06-01)

## Corpus Check
- 11 files · ~15,766 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 263 nodes · 366 edges · 22 communities (12 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0f26b039`
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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 12 edges
2. `scripts` - 9 edges
3. `asRecord()` - 9 edges
4. `asRecord()` - 9 edges
5. `findOpenFoodFactsProductForIngredient()` - 8 edges
6. `findOpenFoodFactsProductForIngredient()` - 8 edges
7. `boundedString()` - 7 edges
8. `normalizePrototypeSessionSettings()` - 7 edges
9. `boundedString()` - 7 edges
10. `normalizePrototypeSessionSettings()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `parseCachedProduct()` --calls--> `asRecord()`  [EXTRACTED]
  src/index.ts → src/index.ts  _Bridges community 8 → community 4_
- `parseCachedProduct()` --calls--> `asRecord()`  [EXTRACTED]
  lib/index.js → lib/index.js  _Bridges community 6 → community 11_
- `readOpenFoodFactsCachedProduct()` --calls--> `openFoodFactsCacheDocId()`  [EXTRACTED]
  lib/index.js → lib/index.js  _Bridges community 7 → community 11_

## Communities (22 total, 10 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (48): allEvents, anonymousSessionsRef, app_1, body, calendarOAuthSecrets, calendarUtils_1, cookingAdjectives, crypto_1 (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (40): anonymousSessionsRef, CalendarEvent, calendarFetchIcs, calendarGoogleExchange, calendarOAuthSecrets, calendarOutlookExchange, calendarSubscriptionRefresh, CalendarToken (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (26): dependencies, firebase-admin, firebase-functions, @google-cloud/functions-framework, devDependencies, eslint, eslint-config-google, eslint-plugin-import (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (14): calendarEventsToDeadlines(), Deadline, exchangeGoogleCode(), exchangeOutlookCode(), fetchGoogleEvents(), fetchOutlookEvents(), filterFutureEvents(), GoogleEvent (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (16): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findOpenFoodFactsProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId(), openFoodFactsCategoryTerms() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (14): compileOnSave, compilerOptions, esModuleInterop, module, moduleResolution, noImplicitReturns, noUnusedLocals, outDir (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.24
Nodes (13): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeCalendarEvent(), normalizeCalendarToken(), normalizeDeadline(), normalizeIcsSubscription() (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (13): cacheOpenFoodFactsProduct(), compactOpenFoodFactsProduct(), fetchOpenFoodFactsProductForIngredient(), fetchOpenFoodFactsProducts(), findOpenFoodFactsProductForIngredient(), normalizeIngredientKey(), openFoodFactsCacheDocId(), openFoodFactsCategoryTerms() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.24
Nodes (13): asRecord(), boundedNumber(), boundedString(), boundedStringList(), normalizeCalendarEvent(), normalizeCalendarToken(), normalizeDeadline(), normalizeIcsSubscription() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (6): data, getPrototypeData(), parseCachedProduct(), readOpenFoodFactsCachedProduct(), seedPrototypeData(), timestampMillis()

### Community 12 - "Community 12"
Cohesion: 0.40
Nodes (4): canonicalConstraints, deadlineBootstrap, prototypeMeta, seededMeals

## Knowledge Gaps
- **127 isolated node(s):** `include`, `name`, `lint`, `build`, `build:watch` (+122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `include`, `name`, `lint` to the rest of the system?**
  _127 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12280701754385964 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._