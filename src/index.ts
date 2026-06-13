import { serve } from "bun";
import index from "./index.html";
import { deadlineBootstrap } from "./data/seededScenario";
import { seededMeals } from "./data/seededMeals";

const sessionRetentionDays = 90;
const anonymousSessions = new Map<string, { settings: unknown; updatedAt: string; expiresAt: string }>();
// Real (non-anonymous) accounts key their data directly by Firebase uid, mirroring
// the uid-keyed accountSessions collection used by the Firebase Functions backend.
// Account sessions never expire (expiresAt stays null) — only anonymous sessions
// carry a rolling TTL. Mirrors the Firebase backend.
const accountSessions = new Map<string, { settings: unknown; updatedAt: string; expiresAt: string | null }>();
const sessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;
const firebaseFunctionsBaseUrl = process.env.BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL?.replace(/\/$/, "");
const publicEnvKeys = [
  "BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND",
  "BUN_PUBLIC_FIREBASE_API_KEY",
  "BUN_PUBLIC_FIREBASE_APP_ID",
  "BUN_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "BUN_PUBLIC_FIREBASE_AUTH_EMULATOR_URL",
  "BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL",
  "BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION",
  "BUN_PUBLIC_FIREBASE_PROJECT_ID",
  "BUN_PUBLIC_GOOGLE_CLIENT_ID",
  "BUN_PUBLIC_MICROSOFT_CLIENT_ID",
  "BUN_PUBLIC_POSTHOG_HOST",
  "BUN_PUBLIC_POSTHOG_PROJECT_TOKEN",
] as const;

function publicEnvJson(): Response {
  const publicEnv = Object.fromEntries(
    publicEnvKeys
      .map((key) => [key, process.env[key] ?? ""] as const)
      .filter(([, value]) => value.length > 0),
  );

  return Response.json(publicEnv, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function sessionResponse(sessionId: string, settings: unknown | null, expiresAt: string | null) {
  return Response.json({
    sessionId,
    settings,
    retentionDays: sessionRetentionDays,
    expiresAt,
  });
}

function expiresAtFromNow() {
  return new Date(Date.now() + sessionRetentionDays * 24 * 60 * 60 * 1000).toISOString();
}

// Stable client-facing handle for an account's session — base64url(uid), which
// satisfies sessionIdPattern. Matches accountSessionHandle in the Firebase backend.
function accountSessionHandle(uid: string): string {
  return Buffer.from(uid).toString("base64url");
}

// DEV ONLY: decode (without verifying) the Firebase ID token to read the uid and
// sign-in provider. The local Bun backend is a dev convenience and has no Firebase
// Admin SDK; the deployed Firebase Functions backend verifies tokens properly.
// Anonymous Firebase users are reported with isAnonymous=true so they stay on
// session-keyed storage.
function decodeAccountFromRequest(req: Request): { uid: string; isAnonymous: boolean } | null {
  const authorization = req.headers.get("authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  try {
    const payloadSegment = match[1].split(".")[1];
    if (!payloadSegment) return null;

    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as {
      sub?: unknown;
      user_id?: unknown;
      firebase?: { sign_in_provider?: unknown };
    };

    const uid =
      typeof payload.user_id === "string" ? payload.user_id :
        typeof payload.sub === "string" ? payload.sub : null;
    if (uid === null) return null;

    return { uid, isAnonymous: payload.firebase?.sign_in_provider === "anonymous" };
  } catch {
    return null;
  }
}

async function proxyToFirebaseFunction(functionName: string, req: Request): Promise<Response> {
  if (!firebaseFunctionsBaseUrl) {
    return Response.json(
      { error: "Firebase Functions emulator is not configured. Run bun run firebase:dev for local function calls." },
      { status: 503 },
    );
  }

  const target = new URL(`${firebaseFunctionsBaseUrl}/${functionName}`);
  target.search = new URL(req.url).search;

  const response = await fetch(target, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  }).catch(() => null);

  if (response === null) {
    return Response.json({ error: "Firebase Functions emulator could not be reached." }, { status: 502 });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/public-env": {
      async GET() {
        return publicEnvJson();
      },
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/deadline-food/bootstrap": {
      async GET() {
        return Response.json(deadlineBootstrap);
      },
    },

    "/api/deadline-food/meals": {
      async GET() {
        return Response.json(seededMeals);
      },
    },

    "/api/deadline-food/scenario": {
      async GET() {
        return Response.json(deadlineBootstrap.canonicalConstraints);
      },
    },

    "/api/deadline-food/nutrition/openfoodfacts": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodNutrition", req);
      },
    },

    "/api/deadline-food/stores/nearby": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodNearbyStores", req);
      },
    },

    "/api/deadline-food/recipes": {
      async GET(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipes", req);
      },
    },

    "/api/deadline-food/recipe": {
      async GET(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipe", req);
      },
    },

    "/api/deadline-food/recipe-states": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipeStates", req);
      },
    },

    "/api/deadline-food/recipe-reviews": {
      async GET(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipeReviews", req);
      },
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipeReviews", req);
      },
    },

    "/api/deadline-food/session": {
      async GET(req) {
        const account = decodeAccountFromRequest(req);
        const accountUid = account && !account.isAnonymous ? account.uid : null;

        if (accountUid !== null) {
          let record = accountSessions.get(accountUid);

          // First load for this account: adopt the in-progress anonymous session
          // the request arrived with, so signing in mid-onboarding keeps the plan.
          if (record === undefined) {
            const requestedSessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
            const anon = sessionIdPattern.test(requestedSessionId)
              ? anonymousSessions.get(requestedSessionId)
              : undefined;
            if (anon?.settings != null) {
              // Account sessions never expire; the anonymous save is migrated in
              // and its (now redundant) record dropped — matching the Firebase backend.
              record = { settings: anon.settings, updatedAt: new Date().toISOString(), expiresAt: null };
              accountSessions.set(accountUid, record);
              anonymousSessions.delete(requestedSessionId);
            }
          }

          if (record !== undefined) {
            // Account sessions don't expire; just touch updatedAt.
            record.updatedAt = new Date().toISOString();
          }

          return sessionResponse(accountSessionHandle(accountUid), record?.settings ?? null, null);
        }

        const sessionId = new URL(req.url).searchParams.get("sessionId");

        if (!sessionIdPattern.test(sessionId ?? "")) {
          return Response.json({ error: "A valid anonymous session ID is required." }, { status: 400 });
        }

        const session = anonymousSessions.get(sessionId as string);

        if (session !== undefined) {
          session.expiresAt = expiresAtFromNow();
          session.updatedAt = new Date().toISOString();
        }

        return sessionResponse(sessionId as string, session?.settings ?? null, session?.expiresAt ?? null);
      },
      async PUT(req) {
        const payload = await req.json().catch(() => null) as { sessionId?: unknown; settings?: unknown } | null;

        if (payload?.settings === null || typeof payload?.settings !== "object") {
          return Response.json({ error: "Session settings are required." }, { status: 400 });
        }

        const expiresAt = expiresAtFromNow();
        const account = decodeAccountFromRequest(req);
        const accountUid = account && !account.isAnonymous ? account.uid : null;

        if (accountUid !== null) {
          accountSessions.set(accountUid, {
            settings: payload.settings,
            updatedAt: new Date().toISOString(),
            expiresAt: null,
          });
          return sessionResponse(accountSessionHandle(accountUid), payload.settings, null);
        }

        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";

        if (!sessionIdPattern.test(sessionId)) {
          return Response.json({ error: "A valid anonymous session ID is required." }, { status: 400 });
        }

        anonymousSessions.set(sessionId, {
          settings: payload.settings,
          updatedAt: new Date().toISOString(),
          expiresAt,
        });

        return sessionResponse(sessionId, payload.settings, expiresAt);
      },
      async DELETE(req) {
        // Permanently deletes a signed-in account's profile. The local Bun backend
        // has no Firebase Admin SDK, so (unlike the deployed Functions backend) it
        // can only drop the in-memory profile record, not the emulator Auth user —
        // adequate for dev, since the client signs out and reloads regardless.
        const account = decodeAccountFromRequest(req);
        const accountUid = account && !account.isAnonymous ? account.uid : null;

        if (accountUid === null) {
          return Response.json(
            { error: "A signed-in account is required to delete an account." },
            { status: 401 },
          );
        }

        accountSessions.delete(accountUid);
        return Response.json({ deleted: true });
      },
    },

    "/api/recommender/user": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecommenderUser", req);
      },
    },

    "/api/recommender/recipe": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipeCreate", req);
      },
    },

    "/api/recommender/recipe/delete": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipeDelete", req);
      },
    },

    "/api/recommender/recipe/unpublish": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipeUnpublish", req);
      },
    },

    "/api/recommender/recommendations": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodRecommendations", req);
      },
    },

    "/api/recommender/interaction": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodInteraction", req);
      },
    },

    "/api/recommender/deadline-context": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodDeadlineContext", req);
      },
    },

    "/api/deadline-food/auto-plan": {
      async POST(req) {
        return proxyToFirebaseFunction("deadlineFoodAutoPlan", req);
      },
    },

    "/api/calendar/fetch-ics": {
      async POST(req) {
        const body = await req.json().catch(() => null) as { url?: string } | null;
        const url = body?.url?.trim();

        if (!url) {
          return Response.json({ error: "A calendar URL is required." }, { status: 400 });
        }

        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return Response.json({ error: "Invalid URL." }, { status: 400 });
        }

        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return Response.json({ error: "Only https:// URLs are supported." }, { status: 400 });
        }

        const upstream = await fetch(url, {
          headers: { Accept: "text/calendar, text/plain" },
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);

        if (!upstream || !upstream.ok) {
          return Response.json(
            { error: `Calendar could not be fetched (${upstream?.status ?? "network error"}).` },
            { status: 502 },
          );
        }

        const text = await upstream.text();

        if (!text.includes("BEGIN:VCALENDAR")) {
          return Response.json({ error: "The URL did not return a valid iCalendar file." }, { status: 422 });
        }

        return new Response(text, {
          headers: { "Content-Type": "text/calendar; charset=utf-8" },
        });
      },
    },

    "/api/deadline-food/recipe-photo": {
      async POST(req) {
        if (firebaseFunctionsBaseUrl) {
          return proxyToFirebaseFunction("deadlineFoodRecipePhoto", req);
        }
        const body = await req.json().catch(() => null) as { mimeType?: string; dataBase64?: string } | null;
        if (!body?.dataBase64 || !body?.mimeType) {
          return Response.json({ error: "dataBase64 and mimeType are required." }, { status: 400 });
        }
        return Response.json({ photoUrl: `data:${body.mimeType};base64,${body.dataBase64}` });
      },
    },

    "/api/calendar/google-exchange": {
      async POST(req) {
        return proxyToFirebaseFunction("calendarGoogleExchange", req);
      },
    },

    "/api/calendar/outlook-exchange": {
      async POST(req) {
        return proxyToFirebaseFunction("calendarOutlookExchange", req);
      },
    },

    "/api/hello": {
      async GET() {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT() {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
