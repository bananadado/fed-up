import { expect, test } from "@playwright/test";
import { defaultDeadlines, initialPreferences } from "../src/prototype/data";
import {
  ANONYMOUS_SESSION_STORAGE_KEY,
  createPrototypeSessionSettings,
} from "../src/prototype/sessionPersistence";

test("deadline food autopilot flow can onboard, rescue a meal, and add a recipe", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /healthy meals that fit around coursework/i })).toBeVisible();
  await page.getByRole("button", { name: /build my meal plan/i }).click();

  await expect(page.getByRole("heading", { name: /connect your calendar/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /upload \.ics file/i })).toBeVisible();
  await page.getByRole("button", { name: /skip for now/i }).click();
  const calendarWarning = page.getByRole("dialog", { name: /continue without a calendar/i });
  await expect(calendarWarning).toBeVisible();
  await page.getByRole("button", { name: /continue anyway/i }).click();

  await expect(page.getByRole("heading", { name: /about you/i })).toBeVisible();
  await page.getByLabel("Current cooking ability").click();
  await page.getByRole("option", { name: /beginner/i }).click();
  await page.getByRole("button", { name: "Tofu" }).click();
  await page.getByPlaceholder("Add an ingredient you dislike").fill("Aubergine");
  await page.getByPlaceholder("Add an ingredient you dislike").press("Enter");
  await expect(page.getByRole("button", { name: "Aubergine" })).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /what works for you/i })).toBeVisible();
  await page.getByLabel("Kitchen access").click();
  await page.getByRole("option", { name: "Full kitchen" }).click();
  await page.getByLabel("Your university").click();
  await page.getByRole("option", { name: "Imperial College London" }).click();
  await expect(page.getByRole("heading", { name: /planning priorities/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /keep costs low/i })).toBeVisible();
  await page.getByRole("button", { name: /create my plan/i }).click();

  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
  await expect(page.getByText(/planned spend/i)).toBeVisible();
  const desktopNav = page.locator("header nav");
  await desktopNav.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /deadline calendar/i })).toBeVisible();
  await expect(page.getByText(/no calendar has been imported/i)).toBeVisible();
  await expect(page.getByText("Algorithms coursework")).toHaveCount(0);
  await expect(page.getByText("Design review")).toHaveCount(0);
  await expect(page.getByText("Databases quiz")).toHaveCount(0);
  await desktopNav.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
  await page.getByRole("button", { name: /view full plan/i }).click();

  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await page.getByRole("button", { name: /overnight oat jar/i }).first().click();
  await expect(page.getByRole("heading", { name: /overnight oat jar/i })).toBeVisible();
  await page.getByRole("button", { name: /go back to plan/i }).click();
  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await page.getByRole("button", { name: /overnight oat jar/i }).first().click();
  await expect(page.getByRole("heading", { name: /overnight oat jar/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /ingredients/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /method/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /nutrition/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /reviews/i })).toBeVisible();
  await page.getByRole("button", { name: /edit recipe/i }).click();
  await expect(page.getByRole("heading", { name: /edit recipe/i })).toBeVisible();
  await page.getByRole("button", { name: /save recipe/i }).click();
  await expect(page.getByRole("heading", { name: /ingredients/i })).toBeVisible();
  await page.getByRole("button", { name: "Back to plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await page.getByRole("button", { name: /change meal/i }).first().click();
  await expect(page.getByRole("heading", { name: /change this meal/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /use selected/i })).toBeVisible();
  await expect(page.getByText(/after/i)).toBeVisible();
  await page.getByRole("button", { name: /use selected/i }).click();
  await expect(page.getByText("Rescued")).toBeVisible();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page.getByRole("button", { name: "Add Recipe", exact: true }).click();
  await expect(page.getByRole("heading", { name: /new recipe/i })).toBeVisible();
  await page.getByLabel("Recipe name").fill("Microwave bean burrito");
  await page.getByLabel("Servings").fill("3");
  await page.getByLabel("Total recipe cost (£)").fill("4.50");
  await expect(page.getByText("Estimated cost per portion: £1.50")).toBeVisible();
  await page.getByLabel("Ingredient").first().fill("beans");
  await page.getByLabel("Amount").first().fill("100");
  await page.getByLabel("Unit").first().selectOption("g");
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.getByLabel("Ingredient").nth(1).fill("wrap");
  await page.getByLabel("Amount").nth(1).fill("1");
  await page.getByLabel("Unit").nth(1).selectOption("wrap");
  await page.getByRole("button", { name: /^add$/i }).click();
  await page.getByLabel("Ingredient").nth(2).fill("tomato");
  await page.getByLabel("Amount").nth(2).fill("50");
  await page.getByLabel("Unit").nth(2).selectOption("g");
  await page.getByLabel("Method").fill("Warm the beans.\nFill the wrap.");
  await page.getByRole("button", { name: "Add recipe", exact: true }).click();
  await expect(page.getByText("Microwave bean burrito")).toBeVisible();
  await expect(page.getByText("10 min · 100g mixed beans, 1 wrap tortilla wrap, 50g tomato")).toBeVisible();
});

test("onboarding 'skip for now' shows confirmation dialog then advances to 'About you'", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /build my meal plan/i }).click();
  await expect(page.getByRole("heading", { name: /connect your calendar/i })).toBeVisible();
  await page.getByRole("button", { name: /skip for now/i }).click();
  await expect(page.getByRole("dialog", { name: /continue without a calendar/i })).toBeVisible();
  await page.getByRole("button", { name: /continue anyway/i }).click();
  await expect(page.getByRole("heading", { name: /about you/i })).toBeVisible();
});

test("returning users land on dashboard, not the landing or onboarding page", async ({ page }) => {
  const sessionId = "returning-session-39";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createPrototypeSessionSettings({
        preferences: initialPreferences,
        deadlines: defaultDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
      }),
    },
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  const sessionLoaded = page.waitForResponse(
    response =>
      response.url().includes("/api/deadline-food/session") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );

  await page.goto("/");
  await sessionLoaded;
  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  await expect(page.getByRole("heading", { name: /connect your calendar/i })).toHaveCount(0);
});

test("stale onboarding URL resumes returning users at the dashboard", async ({ page }) => {
  const sessionId = "stale-onboarding-session-39";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createPrototypeSessionSettings({
        preferences: initialPreferences,
        deadlines: defaultDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
      }),
    },
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  await page.goto("/#/onboarding");

  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /connect your calendar/i })).toHaveCount(0);
});

test("direct app deep link without a session returns to landing instead of orphaning the shell", async ({ page }) => {
  await page.goto("/#/plan");

  await expect(page.getByRole("heading", { name: /healthy meals that fit around coursework/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /planned meals/i })).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
});

test("direct plan refresh restores nav and seeded timetable for returning users with empty persisted plan", async ({ page }) => {
  const sessionId = "empty-plan-session-39";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createPrototypeSessionSettings({
        preferences: initialPreferences,
        deadlines: defaultDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
        plan: [],
      }),
    },
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  await page.goto("/#/plan");

  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  await expect(page.getByRole("button", { name: /overnight oat jar/i }).first()).toBeVisible();
});

test("dashboard meal cards have swap action that opens the swap modal", async ({ page }) => {
  const sessionId = "dashboard-swap-session-39";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createPrototypeSessionSettings({
        preferences: initialPreferences,
        deadlines: defaultDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
      }),
    },
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  const sessionLoaded = page.waitForResponse(
    response =>
      response.url().includes("/api/deadline-food/session") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );

  await page.goto("/");
  await sessionLoaded;
  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();

  await page.getByRole("button", { name: /change meal/i }).first().click();
  await expect(page.getByRole("heading", { name: /change this meal/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /use selected/i })).toBeVisible();
  await page.getByRole("button", { name: /use selected/i }).click();
  await expect(page.getByRole("heading", { name: /change this meal/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
});

test("missing session load does not overwrite the session with default onboarding state", async ({ page }) => {
  const sessionId = "missing-session-reload-39";
  let saveRequests = 0;

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  await page.route("**/api/deadline-food/session**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId,
          settings: null,
          retentionDays: 90,
          expiresAt: null,
        }),
      });
      return;
    }

    saveRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId,
        settings: null,
        retentionDays: 90,
        expiresAt: null,
      }),
    });
  });

  await page.goto("/#/plan");
  await expect(page.getByRole("heading", { name: /healthy meals that fit around coursework/i })).toBeVisible();
  await page.waitForTimeout(900);

  expect(saveRequests).toBe(0);
});
