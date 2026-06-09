# Development And Testing

## Tooling Baseline

Use Bun by default.

Project guidance in `CLAUDE.md` says:

- Use `bun <file>` instead of `node <file>`.
- Use `bun test` instead of Jest/Vitest.
- Use `bun install` instead of npm/yarn/pnpm.
- Use `Bun.serve()`, not Express.
- Bun automatically loads `.env`.

Exception:

- Firebase Functions have their own package under `functions/`. The repo scripts use Bun to run function scripts, but Firebase tooling and some CI setup may install function dependencies separately.

## Install

```sh
bun install
```

Function dependencies:

```sh
cd functions
bun install
```

The full verification script installs missing dependencies automatically when possible.

## Local App Development

```sh
bun run dev
```

This runs:

```sh
bun --hot src/index.ts
```

Default URL:

```text
http://localhost:3000/
```

Default API mode in non-production:

- Local Bun `/api/deadline-food/*`.

## Local Firebase Development

```sh
bun run firebase:dev
```

This:

1. Starts `backend/docker-compose.yml` under the isolated `drp03-firebase-dev` compose project when an NVIDIA Docker runtime is available.
2. Waits for the recommender API health endpoint.
3. Runs `bun run firebase:data`.
4. Builds Functions.
5. Starts Functions, Firestore, and Storage emulators.
6. Waits for `deadlineFoodBootstrap`.
7. Starts the Bun app configured to call the Firebase emulator.

Emulated Functions receive:

- `RECOMMENDER_API_URL=http://127.0.0.1:8100` for local compose, or `https://recommender.timkolesnichenko.me` when falling back remotely
- `RECOMMENDER_API_KEY=local-firebase-dev-recommender-key` for local compose unless overridden

On Ctrl+C or normal exit, the Firebase emulator is stopped and the compose
project is brought down. `FIREBASE_DEV_BACKEND=auto` is the default: machines
with NVIDIA Docker use the local stack, and other machines use the remote
recommender URL. Set `FIREBASE_DEV_BACKEND=local` to require local compose,
or `FIREBASE_DEV_BACKEND=remote` to skip Docker. Remote recommender endpoints
still require the real `RECOMMENDER_API_KEY` in your environment.

URLs:

- App: `http://localhost:3000/`
- Emulator UI: `http://127.0.0.1:4000`
- Functions base: `http://127.0.0.1:5001/drp03-50059/europe-west2`
- Recommender API: `http://127.0.0.1:8100`

## Build

```sh
bun run build
```

Build implementation:

- `build.ts`
- Bun HTML entrypoint build.
- Tailwind plugin.
- Output to `dist`.
- Public env values injected with `define`.

## Tests And Checks

Root scripts from `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `bun --hot src/index.ts` | Local app server with HMR. |
| `start` | `NODE_ENV=production bun src/index.ts` | Production-like Bun server. |
| `lint` | `eslint "src/**/*.{ts,tsx}" build.ts bun-env.d.ts eslint.config.js playwright.config.ts` | Root lint. |
| `typecheck` | `tsc --noEmit` | Root TypeScript check. |
| `test:domain` | `bun test src/domain --pass-with-no-tests` | Domain planner tests. |
| `test:unit` | `bun test src --pass-with-no-tests` | All src unit tests. |
| `test:e2e` | `playwright test --pass-with-no-tests` | Browser e2e flow. |
| `test:all` | `sh scripts/verify-local.sh` | Full verification. |
| `verify` | `sh scripts/verify-local.sh` | Full verification alias. |
| `audit` | `sh scripts/audit.sh` | Bun audit with known transitive ignores. |
| `build` | `bun run build.ts` | Browser production build. |
| `firebase:data` | `bun run scripts/export-firebase-app-data.ts` | Generate function seed data. |
| `firebase:functions:build` | `bun run firebase:data && cd functions && bun run build` | Generate and build functions. |
| `firebase:functions:lint` | `bun run firebase:data && cd functions && bun run lint` | Generate and lint functions. |
| `firebase:emulators` | `bun run firebase:data && cd functions && bun run build && cd .. && firebase emulators:start --only functions,firestore` | Raw emulator start. |
| `firebase:dev` | `sh scripts/firebase-local-dev.sh` | Emulator plus app dev server. |
| `firebase:deploy` | `bun run firebase:data && bun run firebase:artifacts:setpolicy && firebase deploy --only functions,firestore:rules,firestore:indexes` | Backend deploy. |

## Full Local Verification

```sh
bun run verify
```

`scripts/verify-local.sh` runs:

1. Dependency checks/install.
2. Root lint.
3. Typecheck.
4. Unit tests.
5. Domain tests.
6. Firebase data generation.
7. Function lint.
8. Function build.
9. App build.
10. Security audit.
11. Playwright e2e tests.

If Playwright reports a missing Chromium executable:

```sh
bunx playwright install chromium
bun run verify
```

The script tries to reuse system Chrome/Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Unit Tests

Current test files:

- `src/domain/planGenerator.test.ts`
- `src/lib/posthogConfig.test.ts`
- `src/lib/timeInput.test.ts`
- `src/deadline-food/ingredients.test.ts`
- `src/deadline-food/nutrition.test.ts`
- `src/deadline-food/sessionPersistence.test.ts`
- `src/deadline-food/shopping.test.ts`

Run all:

```sh
bun run test:unit
```

Run one file:

```sh
bun test src/deadline-food/shopping.test.ts
```

## Domain Tests

```sh
bun run test:domain
```

These test the dormant deadline-mode pure planner in `src/domain`.

Important: passing domain tests does not prove the active app UI uses the domain planner.

## E2E Tests

Config:

- `playwright.config.ts`

Spec:

- `e2e/deadline-flow.spec.ts`

Run:

```sh
bun run test:e2e
```

Playwright starts the app using:

```sh
bun run dev
```

unless an existing server is reused outside CI.

The active e2e flow tests:

- Landing CTA.
- Onboarding.
- Preferences and source selection.
- Dashboard.
- Full plan.
- Recipe detail and edit.
- Meal swap/rescue.
- Custom recipe creation.
- Returning anonymous session.

## Linting

Root lint config:

- `eslint.config.js`

Root lint ignores:

- `.vercel`
- `.bun`
- `coverage`
- `dist`
- `node_modules`
- `playwright-report`
- `test-results`

Function lint:

- `functions/.eslintrc.js`
- Uses ESLint 8 with Google config.

## Security Audit

Run:

```sh
bun run audit
```

`scripts/audit.sh` uses `bun audit --audit-level=moderate` and ignores a known set of advisories tied to pinned CI tooling transitive dependencies.

Do not add new ignores casually. If adding or upgrading dependencies, re-run audit and explain any new advisory.

## CI Pipeline

Config:

- `.gitlab-ci.yml`

Stages:

1. `dependencies`
2. `checks`
3. `app`
4. `build`
5. `security`
6. `backend_deploy`
7. `deploy`

Main jobs:

- `merge_policy`
- `lint`
- `typecheck`
- `unit_tests`
- `domain_tests`
- `firebase_functions`
- `e2e_tests`
- `build`
- `audit`
- GitLab SAST, secret detection, dependency scanning.
- `deploy_firebase_staging`
- `deploy_firebase_production`
- `deploy_staging`
- `deploy_production`

Branch rules:

- Only `staging` may merge into `master`.
- Firebase staging deploy on pushes to `staging`.
- Firebase production deploy on pushes to `master`.
- Vercel staging deploy on pushes to `staging`.
- Vercel production deploy on pushes to `master`.

## Frontend Deployment

Vercel config:

- `vercel.json`

Settings:

- Install: `bun install --frozen-lockfile`
- Build: `bun run build`
- Output: `dist`
- Rewrite all paths to `/index.html`
- Git deployment disabled in Vercel config; CI handles deploys.

## Backend Deployment

Firebase deploy command:

```sh
bun run firebase:deploy
```

CI backend deploy requires:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY_B64`

README documents suggested IAM roles.

## Environment Variables

Frontend public env values:

- `BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND`
- `BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL`
- `BUN_PUBLIC_FIREBASE_PROJECT_ID`
- `BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION`
- `BUN_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `BUN_PUBLIC_POSTHOG_HOST`

Firebase/OpenFoodFacts env values:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_FUNCTIONS_REGION`
- `FIREBASE_FUNCTIONS_HOST`
- `FIREBASE_FUNCTIONS_PORT`
- `OPENFOODFACTS_BASE_URL`
- `OPENFOODFACTS_USER_AGENT`

CI/deploy env values:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_STAGING_ALIAS`
- `FIREBASE_SERVICE_ACCOUNT_KEY_B64`

## Troubleshooting

### App calls local API but you expected Firebase

Set the browser query override:

```text
?deadlineFoodApiBackend=firebase&firebaseFunctionsBaseUrl=http://127.0.0.1:5001/drp03-50059/europe-west2
```

Or run:

```sh
bun run firebase:dev
```

### Local nutrition returns 503

The local Bun endpoint proxies nutrition to Firebase Functions. Configure `BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL` or use `bun run firebase:dev`.

### Session does not persist after server restart

Regular `bun run dev` uses in-memory session storage. Use `bun run firebase:dev` to test Firestore-backed anonymous persistence.

### Firestore client calls fail

Expected. Firestore rules deny all direct client access. Use Functions or implement auth/rules deliberately.

### E2E cannot find browser executable

Run:

```sh
bunx playwright install chromium
```

Or set:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium
```

### E2E selectors fail after copy changes

The Playwright tests target visible headings and button text. Update `e2e/deadline-flow.spec.ts` if product copy intentionally changes.
