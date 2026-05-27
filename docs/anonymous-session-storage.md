# Anonymous Session Storage

Tracking issue: #22

Deadline Food Autopilot uses anonymous, no-sign-in sessions to persist prototype
settings without introducing accounts. The browser keeps only an opaque session
ID in `localStorage`; the settings payload is stored behind the backend in
Firestore.

## What Is Persisted

The current settings schema is versioned as `settingsVersion: 1` and stores:

- `preferences`: cooking time, budget, kitchen, postcode, university, dietary
  tags, allergens, likes, and dislikes.
- `deadlines`: the imported or edited deadline list used by onboarding.
- `selectedSources`: selected recipe source toggles.
- `onboarded`: whether the user has completed onboarding.

Plans, rescue choices, custom recipe edits, and screen navigation are not part
of this session record yet. They remain in component state and reset on refresh.

## Data Model

Firebase Functions store records in:

```text
anonymousSessions/{sessionId}
```

Each document contains:

```ts
{
  schemaVersion: 1,
  settingsVersion: 1,
  settings: {
    settingsVersion: 1,
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
by the backend. There is no user account, email address, or authentication
provider attached to the record.

## API

The frontend calls the shared Deadline Food API adapter. In local Bun mode it
uses `/api/deadline-food/session`; in Firebase mode it uses the
`deadlineFoodSession` function.

### Load Settings

```http
GET /api/deadline-food/session?sessionId=<anonymous-session-id>
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
Content-Type: application/json

{
  "sessionId": "<anonymous-session-id>",
  "settings": {
    "settingsVersion": 1,
    "preferences": {},
    "deadlines": [],
    "selectedSources": [],
    "onboarded": false
  }
}
```

The backend normalizes and bounds strings, arrays, deadlines, and numeric
preferences before writing to Firestore.

## Retention And Clearing

If a user clears browser storage, uses another browser, or loses the session ID,
the app cannot know which Firestore document belonged to that user. That is the
tradeoff of no-sign-in anonymous persistence.

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

## Migration Path

Future account-based persistence should migrate this shape rather than replacing
it in place:

1. Keep `settingsVersion` and add new versions for breaking payload changes.
2. Add an authenticated user collection when sign-in exists.
3. On first authenticated save, copy the anonymous session settings into the
   user-owned record if no newer authenticated settings exist.
4. Leave the anonymous document to expire through TTL.

This lets anonymous users upgrade without requiring every stale anonymous record
to be joined to a future account.
