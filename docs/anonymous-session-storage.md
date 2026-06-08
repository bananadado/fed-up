# Anonymous Session Storage

Tracking issue: #22

Deadline Food Autopilot starts every user in an anonymous session and can
optionally attach that session to Firebase Auth. The browser keeps an opaque
session ID in `localStorage`; the settings payload is stored behind the backend
in Firestore.

## What Is Persisted

The current settings schema is versioned as `settingsVersion: 3` and stores:

- `preferences`: cooking time, budget, kitchen, postcode, university, dietary
  tags, allergens, likes, dislikes, planning horizon, and plan update mode.
- `deadlines`: the imported or edited deadline list used by onboarding.
- `selectedSources`: selected recipe source toggles.
- `onboarded`: whether the user has completed onboarding.
- `customRecipes`, Discover saved/rejected state, reviewed recipe IDs, the
  current generated plan, plan signature metadata, imported calendar events,
  ICS subscriptions, and calendar refresh tokens.

Screen navigation is not part of this session record.

## Data Model

Firebase Functions store records in:

```text
anonymousSessions/{sessionId}
accountSessions/{base64url(firebaseAuthUid)}
```

Each document contains:

```ts
{
  schemaVersion: 1,
  settingsVersion: 3,
  authUid: "firebase-auth-uid", // only after optional account attachment
  settings: {
    settingsVersion: 3,
    preferences: { ... },
    deadlines: [ ... ],
    selectedSources: [ ... ],
    onboarded: true | false
  },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  expiresAt: Timestamp
}
```

`sessionId` is a random UUID-style value generated in the browser and validated
by the backend. If Firebase Auth is configured, the frontend also signs the user
in anonymously and sends a Firebase ID token with session requests. The
`deadlineFoodSession` function verifies that token with Firebase Admin before
claiming or returning a user-owned session.

`accountSessions` is a small pointer from Firebase Auth UID to the current
anonymous session ID. It lets a linked Google/Microsoft user recover the same
session from another browser without making Firestore readable from the client.

## API

The frontend calls the shared Deadline Food API adapter. In local Bun mode it
uses `/api/deadline-food/session`; in Firebase mode it uses the
`deadlineFoodSession` function.

### Load Settings

```http
GET /api/deadline-food/session?sessionId=<anonymous-session-id>
Authorization: Bearer <firebase-id-token> # optional
```

Response:

```json
{
  "sessionId": "<anonymous-session-id>",
  "settings": null,
  "retentionDays": 90,
  "expiresAt": null
}
```

If the document exists, `settings` contains the versioned settings payload.

### Save Settings

```http
PUT /api/deadline-food/session
Authorization: Bearer <firebase-id-token> # optional
Content-Type: application/json

{
  "sessionId": "<anonymous-session-id>",
  "settings": {
    "settingsVersion": 3,
    "preferences": {},
    "deadlines": [],
    "selectedSources": [],
    "onboarded": false
  }
}
```

The backend normalizes and bounds strings, arrays, deadlines, plan entries,
calendar data, and numeric preferences before writing to Firestore. If the
request includes a valid Firebase token, an unowned anonymous session is claimed
for that Firebase UID. If the requested session belongs to another UID, the
backend creates a fresh session instead of exposing or overwriting the other
user's data.

## Optional Account Persistence

The app remains usable without accounts. To enable account persistence:

1. In Firebase Console, enable Authentication.
2. Enable Anonymous, Google, and Microsoft providers under Sign-in method.
3. Add the app domains under Authentication > Settings > Authorized domains,
   including `localhost` for local development and your deployed domain.
4. Add the Firebase web app config to `.env` or deployment env vars:

```bash
BUN_PUBLIC_FIREBASE_API_KEY=...
BUN_PUBLIC_FIREBASE_AUTH_DOMAIN=drp03-50059.firebaseapp.com
BUN_PUBLIC_FIREBASE_PROJECT_ID=drp03-50059
BUN_PUBLIC_FIREBASE_APP_ID=...
```

For local Auth emulator testing, also set:

```bash
BUN_PUBLIC_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
```

When Firebase Auth is not configured, the Settings account card reports that
anonymous sessions are active and the app keeps using local anonymous session
IDs as before.

## Retention And Clearing

If a user clears browser storage before linking Google or Microsoft, the app
cannot know which Firestore document belonged to that user. Once linked,
Firebase Auth can recover the session through `accountSessions`.

Cleanup is handled with a rolling expiry:

- Every save writes a fresh `expiresAt` value 90 days in the future.
- Loading an existing session also refreshes `expiresAt`.
- Firestore TTL should be enabled on `anonymousSessions.expiresAt` so expired
  documents are removed automatically.

Enable TTL for the Firebase project:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=anonymousSessions \
  --database="(default)" \
  --enable-ttl
```

Check TTL status:

```bash
gcloud firestore fields ttls list \
  --collection-group=anonymousSessions \
  --database="(default)"
```

Firestore TTL deletion is asynchronous. The app must treat expired records as
best-effort cleanup rather than immediate deletion at exactly `expiresAt`.

Reference: Firebase documents TTL policies at
https://firebase.google.com/docs/firestore/ttl.

## Local Development

Regular `bun run dev` uses the Bun API route. That route stores anonymous
session settings in process memory so refreshes work during development, but
server restarts clear the local records.

Use Firebase emulators to exercise Firestore-backed persistence locally:

```bash
bun run firebase:dev
```

Open the URL printed by the script. It includes:

```text
?deadlineFoodApiBackend=firebase&firebaseFunctionsBaseUrl=http://127.0.0.1:5001/<project>/europe-west2
```

Those query parameters are stored locally as backend override flags.

## Migration Notes

Keep `settingsVersion` and add new versions for breaking payload changes. The
account layer deliberately points to the existing anonymous session document, so
anonymous users can upgrade without moving data or requiring every stale
anonymous record to be joined to an account.
