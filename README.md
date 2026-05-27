# bun-react-tailwind-shadcn-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

To run the local pre-commit verification suite:

```bash
bun run verify
```

This runs root lint/typecheck/unit/domain tests, Firebase data generation, functions lint/build, app build, audit, and Playwright e2e tests. If the e2e step reports a missing browser executable, run `bunx playwright install chromium` once and rerun `bun run verify`.

## Anonymous session storage

The prototype persists user settings with anonymous no-sign-in sessions. The
browser stores only an opaque session ID; settings are saved through the backend
to Firestore in `anonymousSessions/{sessionId}`. Stale anonymous records are
handled with a 90-day `expiresAt` field that should be managed by Firestore TTL.

See [docs/anonymous-session-storage.md](docs/anonymous-session-storage.md) for
the data model, API contract, retention policy, local emulator flow, and
migration path.

## Firebase CI deploy setup

GitLab deploys Firebase with these CI/CD variables:

```bash
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_KEY_B64=base64-encoded-service-account-json
```

The service account must be able to run Firebase CLI deploys for functions and Firestore rules/indexes. At minimum, grant it Firebase access, Cloud Functions deploy access, and permission to read/enable project APIs:

```bash
PROJECT_ID=your-firebase-project-id
SERVICE_ACCOUNT=your-ci-service-account@${PROJECT_ID}.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/firebase.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudfunctions.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/firebaserules.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/serviceusage.serviceUsageAdmin"
```

`roles/serviceusage.serviceUsageAdmin` is needed when Firebase CLI checks or enables APIs such as Firestore, Cloud Functions, Cloud Build, Artifact Registry, and Cloud Run. If all required APIs are already enabled, `roles/serviceusage.serviceUsageViewer` may be enough for the API check, but admin is the least painful setup for first deploys.
`roles/firebaserules.admin` is needed to validate and deploy `firestore.rules`.
`roles/artifactregistry.admin` is needed to create or update the cleanup policy for Cloud Run function container images.

This project was created using `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
