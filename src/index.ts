import { serve } from "bun";
import index from "./index.html";
import { deadlineBootstrap } from "./data/seededScenario";
import { seededMeals } from "./data/seededMeals";

const sessionRetentionDays = 90;
const anonymousSessions = new Map<string, { settings: unknown; updatedAt: string; expiresAt: string }>();
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

    "/api/deadline-food/recipes": {
      async GET(req) {
        return proxyToFirebaseFunction("deadlineFoodRecipes", req);
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
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";

        if (!sessionIdPattern.test(sessionId)) {
          return Response.json({ error: "A valid anonymous session ID is required." }, { status: 400 });
        }

        if (payload?.settings === null || typeof payload?.settings !== "object") {
          return Response.json({ error: "Session settings are required." }, { status: 400 });
        }

        const expiresAt = expiresAtFromNow();
        anonymousSessions.set(sessionId, {
          settings: payload.settings,
          updatedAt: new Date().toISOString(),
          expiresAt,
        });

        return sessionResponse(sessionId, payload.settings, expiresAt);
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
