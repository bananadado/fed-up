# Fed Up — Product and Implementation Specification

> **Audience:** AI coding agents (especially Codex) and developers implementing the application.  
> **Document purpose:** Define the product concept, required user experience, MVP scope, implementation constraints, suggested architecture, data model, and acceptance criteria clearly enough that an agent can build the initial application without inventing product decisions.  
> **Status:** Concept-development / walking-skeleton app specification.  
> **Working product name:** **Fed Up**.

---

## 0. Instructions to the Coding Agent

This document is the source of truth for the product behaviour and MVP requirements.

When implementing:

1. **Preserve the product purpose.** This is not a generic recipe application, calorie tracker, food delivery marketplace, or social cooking app.
2. **Optimise for the deadline-week scenario.** The defining interaction is that a stressed student can rapidly obtain or adapt a healthy, affordable, realistic food plan.
3. **Keep the first implementation demonstrable.** The initial app is a convincing interactive app / walking skeleton suitable for user testing. It does not need real campus provider integrations, real nutritional APIs, or production-grade calendar synchronisation.
4. **Build vertical slices before broad features.** A complete flow from onboarding inputs → deadline mode → plan → rescue substitution → recalculated budget is more important than many incomplete screens.
5. **Use deterministic seeded data initially.** Recommendations must be coherent and testable. Do not introduce an LLM recommendation dependency in the MVP.
6. **Do not implement excluded features unless explicitly asked.** See the non-goals section.
7. **Before modifying an existing repository**, inspect its current package manager, framework, routing structure, Firebase configuration, styling conventions, tests, linting and deployment scripts. Integrate with existing conventions rather than replacing them unnecessarily.
8. **After changes**, run the available typecheck, lint, test and build commands. Report any limitations or failing pre-existing checks.

---

## 1. Product Summary

### 1.1 Opportunity statement

> **How might we make healthy, affordable eating the easiest choice during deadline weeks?**

Students may intend to eat well during normal weeks, but during deadlines their decision-making changes. Time, fatigue, budget pressure, late library sessions and uncertainty about what is quick and affordable push them toward convenient fallback food. The product should not require ideal behaviour; it should make the easiest feasible choice healthier and budget-aware.

### 1.2 Product proposition

**Fed Up** is an adaptive web application that helps students handle food during academic pressure.

It:

- identifies or simulates an upcoming deadline-heavy period;
- asks for a small set of realistic constraints, such as remaining budget and maximum effort;
- offers a low-effort deadline-week food strategy;
- recommends planned meals and practical campus/nearby fallback options;
- lets the user immediately recover when the plan becomes unrealistic by tapping **“I have even less time today”**;
- automatically recalculates cost and remaining plan consequences after a substitution.

### 1.3 One-sentence concept

> A deadline-aware food assistant that gives students the lowest-effort healthy, affordable option available today: prepare once, buy smartly, or instantly switch to a realistic fallback.

### 1.4 What makes the concept distinctive

The system is not simply a meal planner. It is designed around **routine failure under time pressure**.

A normal meal planner usually assumes that a user will cook what they planned. Fed Up assumes that plans sometimes fail and treats adaptation as a first-class feature.

The product must therefore demonstrate:

- **anticipation**: noticing or allowing the user to specify a high-pressure week;
- **constraint-aware planning**: budget, time, kitchen constraints and dietary requirements;
- **low cognitive load**: minimal decisions and actionable recommendations;
- **fallback resilience**: purchased options are legitimate, not treated as failure;
- **dynamic replanning**: replacing an unachievable meal without destroying the budget.

---

## 2. Problem Context and Evidence-Led Design Assumptions

The application is designed for a student persona currently called **Steven**:

- Steven wants to eat healthily and affordably.
- During ordinary weeks, he may be able to cook.
- During deadline weeks, he stays late in the library, feels short on time and defaults to nearby convenience options.
- Budget remains important: an intervention that is healthy but too expensive does not solve the problem.
- He needs practical decisions, not generic nutrition education.

The underlying design assumptions are:

1. **Deadline weeks are a different behavioural context from ordinary weeks.** The app must explicitly support a deadline mode, not assume one routine works all term.
2. **Cooking is not always realistic.** A solution that only recommends home cooking fails when the user is already on campus late at night.
3. **Advance preparation can reduce cost and effort, but should be optional.** Some users will use a batch-prep strategy; others lack time, storage or willingness.
4. **Healthy purchased fallback options are part of the solution.** The app should support nearby or campus food choices under a defined budget.
5. **Decision overload matters.** The interface should recommend a small number of credible actions rather than overwhelm the user with recipes or listings.
6. **Unexpected workload changes are normal.** The rescue interaction is central, not a secondary edge case.

---

## 3. Solution Decision and Relationship to Earlier Concepts

The product combines the strongest aspects of four candidate ideas:

| Previous concept | Incorporated role in final product |
|---|---|
| Deadline Mode Meal Planner | Core planning workflow and constraint input |
| Calendar-Aware Food Planning | Trigger for recognising high-pressure periods |
| Campus Healthy Fallback Finder | Rescue path when the user cannot cook |
| Prep Once, Remix All Week | Optional strategy for affordable advance preparation |
| CookTogether / social cooking | Not part of MVP; possible later extension only |

### 3.1 Why a combined solution is required

No individual earlier concept fully satisfies the opportunity statement:

- A meal planner alone can become unrealistic when the student cannot cook.
- A campus fallback finder alone does not help plan the week or maintain budget.
- Calendar awareness alone only warns the user that pressure is coming.
- Batch prep alone depends too heavily on advance organisation.
- Social cooking adds coordination cost at exactly the moment when friction must be minimised.

The final product therefore uses an adaptive workflow:

1. Detect or declare deadline pressure.
2. Generate a realistic low-effort plan.
3. Offer preparation only when feasible.
4. Surface a purchased fallback whenever cooking fails.
5. Update the remaining weekly plan and budget automatically.

---

## 4. Goals, Non-Goals and Success Criteria

### 4.1 Primary goals

The application must:

- make a healthy, affordable action discoverable in seconds during a deadline week;
- show that recommendations respect limited time and money;
- allow users to switch to an even lower-effort option without restarting the plan;
- provide a coherent interactive app for user testing;
- demonstrate technical intelligence through adaptive recommendation logic, not superficial complexity.

### 4.2 Non-goals for the MVP

Do **not** build the following in the initial implementation unless a later task explicitly requests them:

- food ordering or payment;
- real-time integrations with campus cafés, supermarket inventory or discount providers;
- production calendar OAuth/synchronisation;
- LLM-generated meal recommendations;
- computer-vision food recognition;
- calorie tracking, weight-loss targets or medical nutrition advice;
- full social cooking coordination, cost splitting or group chat;
- a broad restaurant discovery application;
- a provider-facing administration portal;
- detailed account management beyond what the demonstration requires.

### 4.3 Product success indicators for app testing

During user testing, the app is successful if students can:

- understand what Deadline Mode does without lengthy explanation;
- configure a deadline-week plan quickly;
- choose between prep, mixed and no-cook/rescue strategies;
- identify the cost and effort implications of each recommendation;
- use the rescue interaction when a scenario changes;
- state that the altered plan feels realistic for an actual deadline week.

---

## 5. Target Users and Stakeholders

### 5.1 Primary user: student under deadline pressure

A student who:

- has one or more assessments due soon;
- has limited food budget;
- may be studying away from home late;
- prefers healthy food but prioritises time and convenience under stress;
- may have dietary constraints or limited kitchen access.

### 5.2 Secondary stakeholders

| Stakeholder | Value provided by the product |
|---|---|
| University wellbeing services | Preventative, practical support before workload causes poor routines |
| Campus food providers | Visibility for student-relevant affordable healthy items |
| Nearby shops or cafés | Ability to surface suitable fallback products or bundles |
| Accommodation / halls | Potential later support for preparation facilities and shared routines |

For the MVP, these stakeholder roles are represented through seeded data and UI framing, not real organisational integrations.

---

## 6. Core User Experience

### 6.1 Experience principle

The interface should make the user feel:

> “This fits the week I am actually having.”

It should not feel like:

> “This is another task I am failing to do properly.”

### 6.2 Primary end-to-end demonstration scenario

The canonical demo scenario is:

- Steven has three deadline-heavy days next week.
- He has a food budget of approximately £24–£25 for the relevant planned meals.
- He expects at least two late library sessions.
- He has access to a kitchen, but only accepts one short preparation session.
- The app recommends a mixed strategy: one prep session, several quick remix meals, and a planned campus fallback.
- During the week Steven discovers he has no time to cook tonight.
- He presses **“I have even less time today.”**
- The system substitutes a nearby healthy affordable purchased option.
- The budget total and remaining plan update visibly.

This flow must be fully implemented in the app.

---

## 7. Required User Flows

## 7.1 Flow A — Enter Deadline Mode

### Purpose

Initiate the core experience and establish that this application is for high-pressure periods.

### Entry mechanisms

For the MVP, support at least one of:

- a homepage call-to-action: **“Plan a deadline week”**;
- a simulated detected deadline prompt: **“Three deadline-heavy days detected next week. Activate Deadline Mode?”**

A manually seeded calendar preview is sufficient. Production calendar integration is not required.

### Required interaction

The user should be able to provide:

- number or selection of deadline-heavy days;
- weekly/planning-period food budget;
- maximum acceptable cooking/preparation time;
- dietary preference or restriction;
- kitchen access constraint;
- whether late campus/library days are expected.

### UX requirement

This setup must be lightweight. Avoid an elaborate questionnaire. The ideal app interaction is a single concise step or a short two-step flow.

---

## 7.2 Flow B — Select a Deadline Strategy

### Required strategies

The application must present three strategy options:

#### 1. Prep Once

For users able to spend one short preparation session in advance.

Display characteristics:

- lowest approximate total cost;
- one initial preparation block;
- several subsequent low-effort meals;
- meal variety through remixing a base into different formats.

#### 2. Mixed Mode

For users who can cook or prep sometimes but expect late campus days.

Display characteristics:

- a balance of prepared meals and purchased fallback meals;
- moderate effort;
- realistic handling of late-library days.

This should be the recommended strategy in the canonical demonstration scenario.

#### 3. No-Cook Rescue

For users who cannot realistically cook during the week.

Display characteristics:

- minimal effort;
- purchased affordable options only;
- likely higher cost than prep modes, but still budget-aware and healthier than unmanaged fallback choices.

### Required information per strategy

Each strategy card must make the trade-off visible:

- total projected cost;
- total or maximum preparation time;
- number of purchased fallback meals;
- a brief reason it fits the supplied constraints.

---

## 7.3 Flow C — View the Weekly Plan

### Purpose

Show a short, executable food plan rather than abstract suggestions.

### Required plan content

For each relevant day, display:

- day/date or relative day label;
- context such as “late library day” or “deadline day” where relevant;
- selected meal/action;
- preparation or collection time;
- per-portion cost;
- meal category: `prepared`, `quick cook`, or `campus fallback`;
- simple suitability tags, e.g. `vegetarian`, `high protein`, `near library`, `no cooking`.

### Required plan summary

Display:

- total projected spend;
- remaining amount within budget or budget overrun warning;
- total preparation commitment;
- a concise explanation of why this plan was chosen.

### Interaction requirements

The user must be able to:

- inspect an individual planned meal;
- replace a planned meal through the rescue interaction;
- return to strategy selection or edit constraints.

---

## 7.4 Flow D — “I Have Even Less Time Today” Rescue Interaction

### Purpose

This is the product's defining interaction. It demonstrates that the product supports real deadline-week failure rather than assuming perfect compliance.

### Trigger

On a planned cook/prep meal, provide an obvious action:

> **I have even less time today**

Alternative acceptable wording:

> **I cannot cook tonight**

Use one consistent label across the application.

### Behaviour

When invoked, the system must:

1. identify that the currently planned cooking option is no longer feasible;
2. display one or more lower-effort fallback options;
3. default to a healthy affordable nearby/campus item that satisfies dietary constraints;
4. show cost and time difference versus the original plan;
5. allow confirmation of the swap;
6. update the day’s meal;
7. recalculate weekly total cost and budget remaining;
8. communicate the result non-judgementally.

### Example result text

> “Tonight has been switched to a nearby £4.20 fallback meal. It takes 2 minutes to collect and your plan remains £1.35 within budget.”

### Failure condition

If no fallback keeps the user inside budget, the product must state this transparently and present the lowest-cost feasible option with the resulting budget difference.

---

## 7.5 Flow E — Campus Fallback Details

### Required functionality

The app must support a small seeded catalogue of healthy, affordable purchased items located near common student study contexts.

For each fallback item display:

- item name;
- provider/location;
- price;
- approximate collection/walking time or convenience label;
- dietary tags;
- simple health-oriented tags;
- availability as app/mock data where needed.

### MVP data approach

Use manually seeded fictionalised or illustrative campus-area options. Do not claim real-time availability or current pricing.

A UI label should make this clear, e.g.:

> “App meal options — availability and prices are illustrative.”

---

## 8. Functional Requirements

The requirements are classified as:

- **MUST**: required for the MVP interactive app.
- **SHOULD**: valuable if achievable without undermining the core flow.
- **COULD**: later enhancement; do not prioritise ahead of MUST features.

### 8.1 Deadline setup

| ID | Priority | Requirement |
|---|---|---|
| FR-001 | MUST | User can enter or select deadline-heavy days for a planning period. |
| FR-002 | MUST | User can set a maximum food budget for the plan. |
| FR-003 | MUST | User can set a maximum acceptable preparation/cooking time. |
| FR-004 | MUST | User can choose at least one dietary preference/restriction. |
| FR-005 | MUST | User can indicate kitchen access and expected late campus days. |
| FR-006 | SHOULD | App can show a simulated calendar/deadline detection prompt. |
| FR-007 | COULD | User can import real calendar deadlines. |

### 8.2 Strategy selection

| ID | Priority | Requirement |
|---|---|---|
| FR-010 | MUST | App generates three strategy options: Prep Once, Mixed Mode and No-Cook Rescue. |
| FR-011 | MUST | Each strategy visibly includes estimated cost and time commitment. |
| FR-012 | MUST | App recommends one strategy based on the selected constraints. |
| FR-013 | MUST | Recommendation reasoning is concise and understandable. |

### 8.3 Plan generation and display

| ID | Priority | Requirement |
|---|---|---|
| FR-020 | MUST | A selected strategy creates a multi-day plan. |
| FR-021 | MUST | Plan contains per-meal price, effort/time and meal type. |
| FR-022 | MUST | Plan calculates total projected spend and comparison against budget. |
| FR-023 | MUST | Plan reflects dietary restrictions when selecting meals. |
| FR-024 | MUST | Mixed mode includes both home/prepared and purchased fallback meals. |
| FR-025 | MUST | Prep Once mode demonstrates base-prep remixing into varied meals. |
| FR-026 | SHOULD | User can manually swap among other feasible recommendations. |

### 8.4 Dynamic rescue

| ID | Priority | Requirement |
|---|---|---|
| FR-030 | MUST | User can mark a cooking meal as infeasible through a one-tap rescue action. |
| FR-031 | MUST | App proposes at least one compatible fallback meal. |
| FR-032 | MUST | App shows cost/time difference before confirming substitution. |
| FR-033 | MUST | Confirming substitution updates the plan and budget summary. |
| FR-034 | MUST | App handles the case where the substitution exceeds the original budget. |
| FR-035 | SHOULD | App preserves a simple history of substitutions for user testing/demo purposes. |

### 8.5 Fallback catalogue

| ID | Priority | Requirement |
|---|---|---|
| FR-040 | MUST | Application includes seeded fallback meal/provider data. |
| FR-041 | MUST | Fallback options can be filtered by dietary restriction and maximum feasible cost. |
| FR-042 | MUST | Fallback details show provider, location/context, price, convenience and tags. |
| FR-043 | SHOULD | User can filter by location context such as library, halls or campus. |
| FR-044 | COULD | Provider-side editing of live menus or discounts. |

### 8.6 Authentication and persistence

| ID | Priority | Requirement |
|---|---|---|
| FR-050 | SHOULD | User can use the app without account creation, using local/demo state. |
| FR-051 | SHOULD | If Firebase Auth is already part of the application, authenticated users can save preferences and plans. |
| FR-052 | SHOULD | Persist the active plan and substitutions in Firestore for authenticated users. |
| FR-053 | COULD | Track previous deadline weeks and user follow-through. |

---

## 9. Recommendation Logic

## 9.1 Design requirement

The MVP must use transparent deterministic logic. Do not implement opaque AI recommendations simply to make the application appear more advanced. The intelligence should be visible in how it adapts choices to constraints.

### 9.2 Inputs

Define a `PlanningConstraints` object containing at least:

```ts
type PlanningConstraints = {
  budgetPence: number;
  deadlineDays: string[];           // ISO dates or stable day identifiers
  lateCampusDays: string[];
  maxPrepMinutes: number;
  kitchenAccess: "full" | "limited" | "none";
  dietaryTags: string[];            // e.g. ["vegetarian"], ["halal"]
  preferredLocation?: string;       // e.g. "library", "halls", "campus"
};
```

### 9.3 Meal item model

A meal option should provide enough metadata for filtering and scoring:

```ts
type MealOption = {
  id: string;
  name: string;
  mealType: "prep_base" | "remix" | "quick_cook" | "fallback";
  pricePence: number;
  prepMinutes: number;
  dietaryTags: string[];
  suitabilityTags: string[];
  location?: string;
  provider?: string;
  derivesFromPrepBaseId?: string;
  illustrativeOnly?: boolean;
};
```

### 9.4 Strategies

```ts
type PlanStrategy = "prep-once" | "mixed" | "no-cook-rescue";
```

### 9.5 Recommended MVP rules

The following logic is adequate for the app:

#### Strategy feasibility rules

- If `kitchenAccess === "none"` or `maxPrepMinutes < 10`, strongly prefer `no-cook-rescue`.
- If there are late campus days and some kitchen access, prefer `mixed`.
- If there is kitchen access, sufficient prep time and a tight budget, prefer `prep-once`.
- If the cheapest feasible plan exceeds budget, still return the cheapest compatible plan and show an over-budget warning.

#### Meal filtering rules

A meal is feasible only if:

- it matches dietary requirements;
- it is compatible with the strategy;
- for cooking/prep options, it does not exceed relevant time constraints;
- fallback options can be selected on late campus days or after rescue.

#### Rescue rules

When a user triggers rescue for a planned non-fallback meal:

1. retrieve fallback meal options satisfying dietary restrictions;
2. prefer fallback options near the user's selected location context;
3. rank first by budget feasibility, then lower time, then lower price;
4. calculate the new projected plan total;
5. display the best option and optional alternatives.

### 9.6 Optional scoring model for later iteration

A future implementation may compute a recommendation score:

```ts
score =
  healthSuitabilityWeight * healthSuitability
  - costWeight * normalisedCost
  - timeWeight * normalisedTime
  - effortWeight * effort
  + varietyWeight * variety
  + contextFitWeight * contextFit;
```

During Deadline Mode, the time and effort weights should increase. This is an important product rule: a theoretically healthy meal is not a good recommendation when the user is unlikely to complete it.

For the MVP, avoid pretending this scoring is scientifically calibrated. If used, label it as heuristic recommendation logic.

---

## 10. Content and Data Requirements

### 10.1 Seed data

The MVP must include enough seeded data for all app flows to work reliably.

Minimum recommended seed catalogue:

- at least 2 prep bases;
- at least 4 remix meals derived from prep bases;
- at least 3 quick-cook meals;
- at least 6 campus/nearby fallback meals;
- dietary diversity including vegetarian-compatible options;
- sufficient prices to demonstrate within-budget and over-budget rescue outcomes.

### 10.2 Illustrative fallback examples

Data should be credible but clearly identified as app/mock information. Example data shape:

```ts
const fallbackOptions: MealOption[] = [
  {
    id: "fallback-library-bean-wrap",
    name: "Bean & Salad Wrap",
    mealType: "fallback",
    pricePence: 410,
    prepMinutes: 2,
    dietaryTags: ["vegetarian"],
    suitabilityTags: ["near library", "no cooking", "balanced"],
    provider: "Library Café",
    location: "library",
    illustrativeOnly: true
  },
  {
    id: "fallback-campus-rice-bowl",
    name: "Chicken Rice Bowl",
    mealType: "fallback",
    pricePence: 470,
    prepMinutes: 4,
    dietaryTags: ["high-protein"],
    suitabilityTags: ["campus", "no cooking"],
    provider: "Campus Food Hall",
    location: "campus",
    illustrativeOnly: true
  }
];
```

### 10.3 Nutrition representation

For the app, do not create medical or precise nutrition claims. Use simple user-facing suitability tags such as:

- balanced;
- contains vegetables;
- high-protein;
- vegetarian;
- vegan;
- halal-compatible only where the data explicitly supports this.

Avoid calories/macros unless actual validated data is later introduced.

---

## 11. Information Architecture and Routes

Assuming a React web application with React Router, the recommended route structure is:

| Route | Purpose |
|---|---|
| `/` | Landing page / product proposition / begin deadline mode |
| `/deadline-mode/setup` | Enter constraints and deadline-week context |
| `/deadline-mode/strategies` | Compare and select Prep Once, Mixed Mode or No-Cook Rescue |
| `/deadline-mode/plan` | View active multi-day plan and budget summary |
| `/deadline-mode/plan/:dayId` | Inspect day/meal detail and trigger rescue |
| `/deadline-mode/rescue/:dayId` | Compare and confirm fallback substitution |
| `/fallbacks` | Browse seeded campus fallback items, optional supporting view |
| `/profile` | Dietary/preferences settings, only if implemented |

For a smaller first iteration, `/deadline-mode/plan/:dayId` and `/deadline-mode/rescue/:dayId` may be modal states within `/deadline-mode/plan` rather than separate routes.

---

## 12. Screen-Level UI Requirements

## 12.1 Landing / activation screen

### Must include

- product name;
- concise value proposition;
- primary CTA: **Plan a deadline week**;
- optional simulated prompt showing upcoming pressure.

### Suggested copy

**Fed Up**  
*Healthy, affordable meals that still work when your week does not.*

CTA: **Activate Deadline Mode**

---

## 12.2 Deadline Mode setup screen

### Must include controls for

- deadline-heavy days;
- budget;
- maximum cooking/preparation time;
- dietary preference;
- kitchen access;
- late library/campus days.

### Design requirements

- fast to complete;
- mobile-width usable even if initially developed desktop-first;
- clear units for money and minutes;
- safe validation: no negative budget/time; at least one planned day.

---

## 12.3 Strategy comparison screen

### Must include

Three selectable cards:

- Prep Once;
- Mixed Mode;
- No-Cook Rescue.

Each card contains:

- total estimate;
- effort/prep summary;
- why it suits or does not suit the entered week;
- a clear recommended badge on the system-selected strategy.

### Important

The cards must illustrate trade-offs, not frame one strategy as morally better. A no-cook plan is valid when the user's constraints make cooking unrealistic.

---

## 12.4 Plan dashboard screen

### Must include

- deadline mode header;
- budget progress indicator;
- daily plan cards/timeline;
- tags distinguishing prep, quick-cook and fallback meals;
- an action to edit plan/setup;
- clear rescue action on cook/prep days.

### Highlight

The rescue action should be prominent enough that test users discover it without prompting.

---

## 12.5 Rescue substitution UI

### Must include

- original meal and its cost/time;
- proposed replacement and its cost/time;
- delta in spend and time saved;
- post-swap total budget state;
- confirm/cancel interactions.

### Tone

Use supportive neutral messaging. Never present purchased fallback food as a failure.

---

## 13. UX and Visual Design Principles

The app should be appropriate for a student-facing wellbeing/productivity tool.

### Required principles

- **Low cognitive load:** one clear next action per screen.
- **High visibility of affordability:** prices and total budget remain visible.
- **Pragmatic, not moralising:** focus on feasibility and support.
- **Progressive detail:** show headline recommendation first; detailed information on demand.
- **Accessible contrast and typography:** meet reasonable accessibility standards.
- **Responsive layout:** usable at typical phone and desktop widths.
- **Honest app state:** seeded/mock provider information is identified as illustrative.

### Avoid

- calorie-counting aesthetic;
- red warning-heavy “failure” messaging;
- crowded recipe discovery interfaces;
- fake live availability claims;
- gamification that distracts from the core deadline-week problem.

---

## 14. Technical Stack and Architectural Assumptions

### 14.1 Existing project direction

Unless repository inspection reveals otherwise, assume the application will use:

- **Bun** as the package manager/runtime tooling;
- **React** with **TypeScript**;
- **React Router** for routing;
- **Tailwind CSS** for styling;
- **shadcn/ui** components where useful for polished accessible UI primitives;
- **Firebase** as the backend platform.

Codex must inspect the existing repository before installing or changing dependencies.

### 14.2 MVP architectural principle

The application should be usable as a demo even without backend credentials or network dependencies. Therefore:

- seeded meal data may live locally in the app for the initial app;
- plan generation should run client-side as pure, testable functions;
- authentication and Firestore persistence are optional integrations unless already configured;
- real external data integrations are not required.

### 14.3 Recommended module separation

Suggested source layout; adapt to existing repository conventions:

```text
src/
  app/
    router.tsx
  pages/
    LandingPage.tsx
    DeadlineSetupPage.tsx
    StrategySelectionPage.tsx
    PlanDashboardPage.tsx
    RescuePage.tsx
    FallbackBrowsePage.tsx
  components/
    DeadlineSetupForm.tsx
    StrategyCard.tsx
    BudgetSummary.tsx
    DailyPlanCard.tsx
    MealTag.tsx
    RescueSwapDialog.tsx
    FallbackMealCard.tsx
  domain/
    types.ts
    constraints.ts
    planGenerator.ts
    rescuePlanner.ts
    recommendationRules.ts
  data/
    seededMeals.ts
    seededScenario.ts
  state/
    planStore.tsx
  firebase/
    config.ts
    auth.ts
    plansRepository.ts
  tests/
    planGenerator.test.ts
    rescuePlanner.test.ts
```

Do not force this structure if the repository already has a strong equivalent architecture.

---

## 15. State Management

### 15.1 State required for MVP

The UI requires state for:

```ts
type DeadlineModeState = {
  constraints: PlanningConstraints | null;
  recommendedStrategy: PlanStrategy | null;
  selectedStrategy: PlanStrategy | null;
  activePlan: WeeklyPlan | null;
  rescueCandidate?: RescueProposal | null;
};
```

### 15.2 Recommended approach

For the app:

- React context plus reducer, or a lightweight existing state solution already present in the repo, is sufficient.
- Persist demo state to `localStorage` if convenient so the user does not lose a plan on refresh.
- Do not add a heavyweight state library solely for this MVP unless already used.

### 15.3 Core plan types

```ts
type PlannedMeal = {
  dayId: string;
  dateLabel: string;
  contextTags: string[];
  meal: MealOption;
  originalMeal?: MealOption;
  wasRescued: boolean;
};

type WeeklyPlan = {
  id: string;
  strategy: PlanStrategy;
  constraints: PlanningConstraints;
  days: PlannedMeal[];
  totalCostPence: number;
  budgetPence: number;
  totalPrepMinutes: number;
  explanation: string;
};

type RescueProposal = {
  dayId: string;
  originalMeal: MealOption;
  replacement: MealOption;
  oldTotalCostPence: number;
  newTotalCostPence: number;
  timeSavedMinutes: number;
  newBudgetDifferencePence: number;
};
```

---

## 16. Firebase Data Model — Optional Persistence Layer

Use Firebase only where useful for persistent user plans/preferences. The app can function locally first.

### 16.1 Authentication

Potential implementation:

- anonymous/demo mode for app testing;
- optional Firebase Auth for saved users;
- do not require sign-in before the user experiences the central flow.

### 16.2 Suggested Firestore collections

```text
users/{uid}
  dietaryTags: string[]
  kitchenAccess: string
  defaultBudgetPence?: number
  createdAt
  updatedAt

users/{uid}/plans/{planId}
  strategy
  constraints
  totalCostPence
  budgetPence
  totalPrepMinutes
  explanation
  status: "active" | "completed" | "archived"
  createdAt
  updatedAt

users/{uid}/plans/{planId}/days/{dayId}
  dateLabel
  contextTags
  mealId
  originalMealId?
  wasRescued
  updatedAt

mealOptions/{mealId}
  name
  mealType
  pricePence
  prepMinutes
  dietaryTags
  suitabilityTags
  location?
  provider?
  illustrativeOnly
```

### 16.3 MVP recommendation

Keep `mealOptions` as local seed data initially unless persistence is already easy in the repository. This ensures repeatable demonstrations and avoids needing an admin interface.

---

## 17. Pure Domain Logic Requirements

The recommendation and budget calculations should be implemented as pure functions wherever possible.

### 17.1 Required functions

Suggested function responsibilities:

```ts
function validateConstraints(input: PlanningConstraints): ValidationResult;

function rankStrategies(
  constraints: PlanningConstraints,
  meals: MealOption[]
): RankedStrategy[];

function generatePlan(
  constraints: PlanningConstraints,
  strategy: PlanStrategy,
  meals: MealOption[]
): WeeklyPlan;

function findRescueOptions(
  plan: WeeklyPlan,
  dayId: string,
  meals: MealOption[]
): RescueProposal[];

function applyRescueSwap(
  plan: WeeklyPlan,
  proposal: RescueProposal
): WeeklyPlan;
```

### 17.2 Invariants

The implementation must preserve:

- all recommended meals satisfy selected dietary constraints;
- calculated total cost equals the sum of planned meal costs;
- replacing a meal recalculates total cost correctly;
- a rescue proposal only replaces the requested day's planned meal;
- if a plan exceeds budget, this state is shown explicitly and not silently hidden;
- a plan with no kitchen access never requires home cooking.

---

## 18. Validation and Edge Cases

The MVP must handle at least the following cases:

| Case | Expected behaviour |
|---|---|
| User enters a zero or invalid budget | Form validation requests a positive usable amount. |
| User has no kitchen access | Recommend No-Cook Rescue and exclude cooking plans. |
| User allows less prep time than all cooking meals require | Exclude cooking meals and prefer fallbacks. |
| Dietary filters remove most options | Show compatible remaining options or communicate insufficient seeded choices. |
| Selected plan exceeds budget | Display over-budget amount clearly; do not hide it. |
| Rescue causes plan to exceed budget | Inform user before confirmation and show cheapest feasible alternative. |
| No fallback matches dietary constraints | Explain that no compatible app option is available; do not substitute incorrectly. |
| Refresh after selecting a plan | Prefer preserving current demo plan through local state persistence. |

---

## 19. Testing Requirements

### 19.1 Domain/unit tests — required

At minimum, test:

1. Mixed Mode is recommended for a canonical scenario with kitchen access plus late campus days.
2. No-Cook Rescue is recommended when kitchen access is `none`.
3. Prep Once is favoured when budget is tight and enough preparation time exists.
4. Dietary filtering removes incompatible meals.
5. Generated plan totals equal the sum of meal prices.
6. Rescue substitution correctly updates the chosen day.
7. Rescue substitution correctly recalculates total cost and remaining budget.
8. Rescue communicates an over-budget state when no in-budget substitution exists.

### 19.2 UI/integration tests — desirable

Where the repository already supports UI testing, test the canonical flow:

1. user enters deadline constraints;
2. user selects recommended Mixed Mode;
3. plan dashboard is displayed;
4. user triggers rescue on a cook meal;
5. user confirms a fallback;
6. updated budget and fallback card appear.

### 19.3 Manual user-test readiness

The built app must support a facilitator giving this scenario:

> “You have multiple deadlines this week, about £24 left for planned meals, and you will be in the library late on at least two days. Set up a plan. Then imagine your meeting overruns and you cannot cook tonight.”

The tester should be able to navigate this without developer intervention.

---

## 20. Analytics / Evaluation Instrumentation — App Level

If simple to implement, record local or development-only interaction events:

```ts
type DeadlineEvent =
  | { type: "deadline_mode_started" }
  | { type: "strategy_viewed" }
  | { type: "strategy_selected"; strategy: PlanStrategy }
  | { type: "rescue_started"; dayId: string }
  | { type: "rescue_confirmed"; dayId: string; replacementMealId: string }
  | { type: "constraints_edited" };
```

Purpose:

- understand whether testers notice the rescue interaction;
- determine which strategy students select;
- gather evidence for concept validation.

Do not introduce invasive tracking or third-party analytics purely for the app.

---

## 21. Accessibility and Responsible Design Requirements

### 21.1 Accessibility

The implementation should:

- support keyboard interaction for form controls, cards and dialogs;
- use labels for all form inputs;
- avoid conveying meal type or budget state through colour alone;
- provide visible focus states;
- maintain readable contrast;
- support responsive mobile layout.

### 21.2 Responsible food guidance

The application must:

- avoid weight-loss or guilt-based messaging;
- avoid presenting meals as medically “healthy” without evidence;
- use practical tags rather than precise nutrition claims in the MVP;
- make app data limitations visible;
- avoid implying that a student has failed when they choose purchased convenience food.

---

## 22. MVP Scope: What Must Be Built First

The first convincing build should contain exactly the following coherent vertical slice:

1. **Landing screen** with activation of Deadline Mode.
2. **Setup flow** collecting budget, deadline days, late days, cooking time, kitchen access and dietary tag.
3. **Strategy comparison** showing three strategies with one recommendation.
4. **Generated multi-day plan dashboard** for the chosen strategy.
5. **Budget summary** with projected spend and remaining/over-budget status.
6. **Seeded fallback catalogue** sufficient for substitutions.
7. **Rescue interaction** that replaces a meal and updates budget.
8. **Deterministic domain logic** with unit tests.
9. **Responsive polished UI** suitable for testing with students.
10. **App disclaimer** for illustrative provider pricing/availability.

This is enough to demonstrate both the design concept and technical sophistication.

---

## 23. Later Enhancements — Explicitly Deferred

Only after the MVP flow works should later development consider:

### Phase 2: Increased realism

- saving plans with Firebase Auth and Firestore;
- real deadline/calendar event input;
- editable preference profile;
- more complete meal catalogue;
- manual location selection and filtering;
- user-test instrumentation.

### Phase 3: Institution/provider integration

- authenticated provider menu feeds;
- real campus meal pricing;
- dynamic offers or end-of-day reductions;
- university wellbeing referral/context content.

### Phase 4: Advanced personalisation

- learned preference ranking based on accepted/rejected recommendations;
- workload-aware notifications;
- richer nutritional data from verified sources;
- opt-in calendar synchronisation;
- uncertainty-aware availability handling.

### Explicitly optional social extension

The earlier **CookTogether** idea could become an optional later mode for halls or societies. It must not replace or block the core individual deadline-week flow.

---

## 24. Acceptance Criteria for the Initial Implementation

The MVP is acceptable only if all of the following are true.

### Product behaviour

- [ ] A user can activate Deadline Mode.
- [ ] A user can configure workload, budget, time, kitchen and dietary constraints.
- [ ] The app shows three distinct strategies and recommends one.
- [ ] The user can generate a realistic multi-day plan.
- [ ] The plan includes meal cost, effort/time and meal type for each day.
- [ ] Total plan cost and relation to budget are visible.
- [ ] At least one cook/prep meal exposes the rescue interaction.
- [ ] Confirming rescue replaces that meal with a compatible fallback.
- [ ] Plan totals update correctly after the replacement.
- [ ] Dietary restrictions are never violated by recommendations.
- [ ] Seeded provider data is clearly marked as illustrative.

### Engineering quality

- [ ] Recommendation and replanning logic is separate from presentation components.
- [ ] Domain functions have automated tests for core invariants.
- [ ] UI is responsive and keyboard-usable.
- [ ] The project builds successfully using repository-standard commands.
- [ ] No unnecessary production dependency or backend integration is introduced for the MVP.

### Demonstration readiness

- [ ] The canonical Steven scenario can be completed end to end.
- [ ] A user tester can discover and use the rescue interaction.
- [ ] The value of the product is visible without needing a verbal explanation of backend complexity.

---

## 25. Canonical Seed Scenario for Development and Testing

Implement a prefilled example or fixture corresponding to:

```ts
const canonicalConstraints: PlanningConstraints = {
  budgetPence: 2400,
  deadlineDays: ["monday", "wednesday", "thursday"],
  lateCampusDays: ["wednesday", "thursday"],
  maxPrepMinutes: 20,
  kitchenAccess: "full",
  dietaryTags: [],
  preferredLocation: "library"
};
```

Expected behaviour:

- Mixed Mode should be recommended.
- Plan should include one short preparation action, at least two low-effort derived/prepared meals and at least one planned purchased fallback.
- Total initial plan should be within or very close to £24 depending on seeded data.
- Triggering rescue on a cook/prep day should suggest a nearby fallback.
- Confirming rescue should visibly alter the total and remaining budget.
- Provide at least one seeded setup in which the rescue remains within budget and at least one in which rescue exceeds budget, enabling demonstration of both UI states.

---

## 26. Suggested Build Order for Codex

Implement in this order unless the existing codebase strongly suggests another sequence:

1. Inspect repository, scripts, dependency conventions and existing routes/components.
2. Define TypeScript domain types.
3. Add deterministic seeded meal/scenario data.
4. Implement and unit-test constraint validation, strategy ranking, plan generation and rescue replacement.
5. Add app state management for active deadline plan.
6. Build setup screen.
7. Build strategy comparison screen.
8. Build plan dashboard and budget summary.
9. Build rescue dialog/page and substitution confirmation.
10. Add app fallback browse/detail UI where needed.
11. Polish responsive styling and accessibility.
12. Integrate Firebase persistence only if already configured or explicitly requested.
13. Run formatting, lint, tests and production build.

---

## 27. Concise Prompt for a Coding Agent

Use this section when assigning the first build task:

> Build the MVP vertical slice described in `FED_UP_SPEC.md`. Inspect the existing React/Bun/Firebase project structure first and reuse its conventions. Implement deterministic client-side domain logic and seeded illustrative meal data before UI wiring. The completed user flow must allow a student to configure a deadline week, compare three strategies, select a plan, trigger “I have even less time today”, confirm a fallback substitution, and see the recalculated budget. Add unit tests for recommendation, dietary filtering and rescue budget recalculation. Do not add real calendar/menu integrations or LLM calls.

---

## 28. Final Product Definition

**Fed Up** is a deadline-week planning and rescue tool for students. Its purpose is not to persuade students that cooking is always best; its purpose is to make a healthy, affordable option the least burdensome available action when academic pressure changes normal behaviour.

The application wins if a student in a stressful week can open it, make very few decisions, obtain a plan that respects real constraints, and recover instantly when that plan becomes impossible.
