/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";
import { App } from "./App";
import { loadBrowserPublicEnv } from "./lib/publicEnv";
import { posthog, registerPostHogSession } from "./lib/posthog";
import { getOrCreateAnonymousSessionId } from "./prototype/anonymousSessionApi";

await loadBrowserPublicEnv();

const elem = document.getElementById("root")!;
registerPostHogSession(posthog, getOrCreateAnonymousSessionId());

const app = (
  <PostHogProvider client={posthog}>
    <PostHogErrorBoundary>
      <StrictMode>
        <App />
      </StrictMode>
    </PostHogErrorBoundary>
  </PostHogProvider>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
