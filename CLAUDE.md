
# Deadline Food Autopilot

Student deadline-week food planning prototype: affordable, low-effort meals with plan failure recovery when cooking becomes unrealistic.

## Runtime

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

Exception: Firebase Functions (`functions/`) use Node 24. Repo scripts use Bun to invoke function tooling, but Firebase itself runs on Node.

## Stack

- Bun runtime, package manager, local server, tests, build
- React 19 + TypeScript
- Tailwind CSS 4 + shadcn-style local UI primitives (`src/components/ui/*`)
- Firebase Functions v2 + Firestore (backend persistence and data APIs)
- GPU Recommender API (FastAPI + pgvector + sentence-transformers) on `gru` server
- Grafana + Prometheus + Loki observability stack
- Playwright (e2e)
- PostHog (optional analytics/session replay)
- Vercel (frontend deploy) + GitLab CI

## Two Frontend Surfaces (Critical)

There are two frontend surfaces. Editing the wrong one is the most common mistake.

### 1. Active Prototype (what users see)

- Mount: `src/App.tsx` renders `<DeadlineFoodPrototype />`
- Root: `src/prototype/DeadlineFoodPrototype.tsx`
- Navigation: hash-based (`#/dashboard`, `#/plan`, etc.)
- Types: `src/prototype/types.ts`
- Seed data: `src/prototype/data.ts`
- Screens: `src/prototype/screens/*.tsx`
- Components: `src/prototype/components/*.tsx`
- E2E coverage: `e2e/deadline-flow.spec.ts`

If the user says "the app", "prototype", or names screens like Dashboard, Plan, Discover, Recipes, Settings, Onboarding — edit `src/prototype/*`.

### 2. Dormant React Router Slice (not mounted)

- Root: `src/app/router.tsx` (NOT currently rendered)
- Pages: `src/pages/*.tsx`
- Domain logic: `src/domain/*.ts`
- State: `src/state/DeadlineModeProvider.tsx`
- Components: `src/components/deadline-food/*.tsx`

This slice more closely matches `DEADLINE_FOOD_AUTOPILOT_SPEC.md` with strategy cards and `/deadline-mode/*` routes. It is covered by `src/domain/planGenerator.test.ts` but NOT by the active e2e flow.

**The two surfaces use different data models.** Active uses `Meal` with `cook|remix|fallback` types and prices in pounds. Dormant uses `MealOption` with `prep_base|remix|quick_cook|fallback` types and prices in pence. Do not mix them without an explicit migration plan.

## Development

```sh
bun install                  # install dependencies
bun run dev                  # local dev server with HMR (http://localhost:3000)
bun run firebase:dev         # emulators + app (Firestore-backed sessions)
bun run build                # production build to dist/
```

## Testing

```sh
bun run lint                 # ESLint
bun run typecheck            # tsc --noEmit
bun run test:unit            # all src unit tests
bun run test:domain          # dormant planner tests (src/domain)
bun run test:e2e             # Playwright browser tests
bun run verify               # full local gate (lint, typecheck, tests, firebase data, functions build, app build, audit, e2e)
```

Testing strategy by risk:

- Copy-only UI change: `lint` + `typecheck`
- Active prototype behaviour change: `lint` + `typecheck` + `test:unit` + `test:e2e`
- Domain planner change: `test:domain` + `typecheck`
- Backend function change: `firebase:data` + `cd functions && bun run lint && bun run build`
- GPU recommender change: edit `backend/`, push to staging — CI deploys only affected services
- Deployment or shared contract change: `verify`

If Playwright cannot find Chromium: `bunx playwright install chromium`

## Backend

### Firebase (frontend data APIs)

Two modes selected by `src/adapters/deadlineFoodApi.ts`:

| | Local Bun (`src/index.ts`) | Firebase Functions (`functions/src/index.ts`) |
| --- | --- | --- |
| Session storage | In-memory Map (lost on restart) | Firestore `anonymousSessions/{id}` |
| Nutrition | Proxies to Firebase Functions | OpenFoodFacts with Firestore cache + rate limit |
| Default in dev | Yes | No |
| Default in prod | No | Yes |

Override with `?deadlineFoodApiBackend=local|firebase` in browser or `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND` env var.

Firebase project: `drp03-50059`, region: `europe-west2`.

Firestore rules deny all direct client access — all data goes through Functions. Do not add client-side Firestore reads/writes without designing auth/rules first.

### GPU Recommender Server (`backend/`)

A Docker Compose stack running on `gru.end-pickerel.ts.net` (Tailscale). Accessible to anyone on the tailnet.

| Service | URL | Notes |
| --- | --- | --- |
| Recommender API | `http://gru.end-pickerel.ts.net:8100` | FastAPI + GPU embeddings |
| API Docs (Swagger) | `http://gru.end-pickerel.ts.net:8100/docs` | Interactive API explorer |
| API Health | `http://gru.end-pickerel.ts.net:8100/health` | Returns `{"status": "ok"}` |
| Grafana | `http://gru.end-pickerel.ts.net:3001` | admin / `deadline-food-2026` |
| Prometheus | `localhost:9090` (on server only) | Metrics store |
| Loki | `localhost:3100` (on server only) | Log aggregation |
| PostgreSQL | `localhost:5432` (on server only) | pgvector, user: `recommender` |

Recommender API endpoints:

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Health check |
| `/recipes` | GET | List all recipes |
| `/recipes` | POST | Create recipe |
| `/recipes/bulk` | POST | Bulk create recipes |
| `/recipes/{id}` | GET | Get recipe by ID |
| `/recipes/{id}/similar` | GET | Find similar recipes (embedding similarity) |
| `/users` | POST | Create/update user profile |
| `/users/{id}` | GET | Get user profile |
| `/interactions` | POST | Record user interaction (swipe, cook, etc.) |
| `/recommend` | POST | Get personalized recommendations |
| `/stats` | GET | Database statistics |
| `/jobs/recompute-all` | POST | Recompute embeddings, co-likes, trending |

Directory structure:

- `backend/recommender-api/` — FastAPI app + Dockerfile (builds `recommender-api` image)
- `backend/db/` — PostgreSQL init schema + seed script
- `backend/monitoring/` — Grafana dashboards, Prometheus, Loki, Promtail, nvidia-exporter configs
- `backend/docker-compose.yml` — full stack definition
- `backend/deploy.sh` — per-service restart script (logs deployments to Loki)
- `backend/.env.example` — template for server-side `.env`

CI/CD deploys only changed services: editing `backend/recommender-api/` restarts only `api`, editing `backend/monitoring/grafana/` restarts only `grafana`, etc. Deployment events appear as annotations on the Grafana dashboard.

### Firebase Commands

```sh
bun run firebase:data        # generate functions/src/generated/prototypeData.ts from src/data/*
bun run firebase:dev         # emulators + dev server
bun run firebase:deploy      # deploy functions, rules, indexes
```

Never manually edit `functions/src/generated/prototypeData.ts` — always regenerate.

## API Endpoints (Frontend)

| Endpoint | Local path | Firebase function |
| --- | --- | --- |
| Bootstrap | `GET /api/deadline-food/bootstrap` | `deadlineFoodBootstrap` |
| Meals | `GET /api/deadline-food/meals` | `deadlineFoodMeals` |
| Scenario | `GET /api/deadline-food/scenario` | `deadlineFoodScenario` |
| Session | `GET/PUT /api/deadline-food/session` | `deadlineFoodSession` |
| Nutrition | `POST /api/deadline-food/nutrition/openfoodfacts` | `deadlineFoodNutrition` |

When adding/changing an endpoint: update `src/adapters/deadlineFoodApi.ts`, local route in `src/index.ts`, Firebase function in `functions/src/index.ts`, and keep response shapes aligned.

## Anonymous Session Persistence

- Session ID stored in `localStorage` key `deadlineFoodAnonymousSessionId`
- Persisted: `prefs`, `deadlines`, `selectedSources`, `onboarded`
- NOT persisted: `plan`, `customRecipes`, `discoverSaved/Rejected`, route history, rescue choices
- Schema version tracked in `src/prototype/sessionPersistence.ts`
- If breaking schema changes: bump version, update normalization in frontend + backend

## Environment Variables

Frontend (browser bundle):

- `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND` — `local` or `firebase`
- `BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL`
- `BUN_PUBLIC_FIREBASE_PROJECT_ID`
- `BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION`
- `BUN_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `BUN_PUBLIC_POSTHOG_HOST`

CI/deploy:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_STAGING_ALIAS`
- `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_KEY_B64`
- `DEPLOY_SSH_KEY_B64` — base64-encoded ed25519 private key for the `deploy` user on `gru`
- `TAILSCALE_AUTH_KEY` — reusable ephemeral Tailscale auth key for CI containers

## CI/Deployment

- GitLab CI (`.gitlab-ci.yml`)
- Only `staging` may merge into `master`
- Staging deploys on push to `staging` (Firebase + Vercel + GPU server)
- Production deploys on push to `master` (Firebase + Vercel + GPU server)
- GPU server deploy triggers only when `backend/**` files change
- CI containers join Tailscale with an ephemeral key, rsync `backend/` to the server, and restart only the affected Docker services

## Implementation Rules

- Do not assume `src/pages/*` or `src/domain/*` power the active prototype — they don't.
- Do not add medical/weight-loss claims or calorie-target framing.
- Do not remove prototype disclaimers about illustrative meal availability/prices.
- Do not make Firestore readable from the client without deliberate auth/rules design.
- Use existing UI primitives (`src/components/ui/*`, `src/prototype/components/primitives.tsx`) before adding new UI libraries.
- Dietary restrictions and allergens are hard filters wherever supported.
- Budget impact must remain visible when swapping meals.
- Purchased fallback meals are neutral and legitimate — never frame as failure.
- Recommendation logic stays deterministic and explainable (no LLM unless explicitly requested).
- PostHog may be undefined if token env is missing — use optional calls.
- E2e tests target visible text selectors — copy changes can break them.

## Product Language

Use: "fallback", "swap", "compatible", "budget left", "over budget", "illustrative price", "broad nutrition signal"

Avoid: "failure", "bad food", "cheat", "diet", weight-loss language, medical health claims, fake real-time availability

## Deeper Documentation

See `doc/` for comprehensive docs:

- `doc/RAG_ROOT.md` — retrieval guide and source map
- `doc/PROJECT_SUMMARY.md` — product context and MVP
- `doc/ARCHITECTURE.md` — stack, entry points, data flows
- `doc/FRONTEND.md` — screens, state, components, analytics
- `doc/DATA_AND_DOMAIN.md` — data models, planner logic, session schema
- `doc/API_CONTRACTS.md` — endpoint specs, request/response shapes
- `doc/FIREBASE_BACKEND.md` — functions, Firestore collections, deploy
- `doc/DEVELOPMENT_AND_TESTING.md` — commands, CI, troubleshooting
- `doc/AI_AGENT_PLAYBOOK.md` — common task recipes for AI agents

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
