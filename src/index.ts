import { serve } from "bun";
import index from "./index.html";
import { deadlineBootstrap } from "./data/seededScenario";
import { seededMeals } from "./data/seededMeals";

const sessionRetentionDays = 90;
const anonymousSessions = new Map<string, { settings: unknown; updatedAt: string; expiresAt: string }>();
const sessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;
const firebaseFunctionsBaseUrl = process.env.BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL?.replace(/\/$/, "");

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

  const response = await fetch(`${firebaseFunctionsBaseUrl}/${functionName}`, {
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
