import { expect, test } from "@playwright/test";
import { initialPreferences } from "../src/deadline-food/data";
import {
  ANONYMOUS_SESSION_STORAGE_KEY,
  createPrivacyConsent,
  createSessionSettings,
} from "../src/deadline-food/sessionPersistence";
import type { Deadline, Meal, PlanEntry } from "../src/deadline-food/types";

const acceptedPrivacyConsent = createPrivacyConsent(new Date("2026-06-09T12:00:00.000Z"));
const e2eDeadlines: Deadline[] = [
  {
    id: "e2e-d1",
    title: "Algorithms coursework",
    date: "Wed 3 Jun",
    time: "16:00",
    intensity: "High",
    eventType: "academic",
    effortHours: 8,
    urgency: "high",
    confirmed: true,
    rawDate: "2026-06-03",
  },
  {
    id: "e2e-d2",
    title: "Design review",
    date: "Thu 4 Jun",
    time: "10:00",
    intensity: "Medium",
    eventType: "academic",
    effortHours: 4,
    urgency: "medium",
    confirmed: true,
    rawDate: "2026-06-04",
  },
  {
    id: "e2e-d3",
    title: "Databases quiz",
    date: "Fri 5 Jun",
    time: "09:00",
    intensity: "High",
    eventType: "academic",
    effortHours: 5,
    urgency: "high",
    confirmed: true,
    rawDate: "2026-06-05",
  },
];
const e2eMeals: Meal[] = [
  {
    id: "e2e-oats",
    name: "E2E oat jar",
    type: "cook",
    mealSlots: ["breakfast"],
    time: 5,
    price: 1.15,
    servings: 1,
    tags: ["breakfast", "quick"],
    ingredients: [{ name: "oats", quantity: 50, unit: "g" }],
    allergens: ["gluten"],
    nutrition: { calories: 390, protein: 13, carbs: 58, fat: 11 },
    rating: 0,
    reviews: [],
    instructions: ["Mix oats with milk.", "Chill until breakfast."],
    source: "E2E fixture",
    note: "",
    image: "test",
  },
  {
    id: "e2e-toast",
    name: "E2E toast",
    type: "cook",
    mealSlots: ["breakfast"],
    time: 6,
    price: 1.35,
    servings: 1,
    tags: ["breakfast"],
    ingredients: [{ name: "bread", quantity: 2, unit: "slice" }],
    allergens: ["gluten"],
    nutrition: { calories: 420, protein: 16, carbs: 52, fat: 15 },
    rating: 0,
    reviews: [],
    instructions: ["Toast the bread.", "Top and serve."],
    source: "E2E fixture",
    note: "",
    image: "test",
  },
  {
    id: "e2e-wrap",
    name: "E2E hummus wrap",
    type: "fallback",
    mealSlots: ["lunch", "dinner"],
    time: 4,
    price: 1.95,
    servings: 1,
    tags: ["quick"],
    ingredients: [{ name: "wrap", quantity: 1, unit: "wrap" }],
    allergens: ["gluten", "sesame"],
    nutrition: { calories: 430, protein: 15, carbs: 58, fat: 15 },
    rating: 0,
    reviews: [],
    instructions: ["Fill the wrap.", "Roll tightly."],
    source: "E2E fixture",
    note: "",
    image: "test",
  },
  {
    id: "e2e-bowl",
    name: "E2E rice bowl",
    type: "fallback",
    mealSlots: ["lunch", "dinner"],
    time: 5,
    price: 2.4,
    servings: 1,
    tags: ["quick"],
    ingredients: [{ name: "rice", quantity: 180, unit: "g" }],
    allergens: [],
    nutrition: { calories: 520, protein: 18, carbs: 84, fat: 9 },
    rating: 0,
    reviews: [],
    instructions: ["Warm the rice.", "Add toppings."],
    source: "E2E fixture",
    note: "",
    image: "test",
  },
];
const e2ePlan: PlanEntry[] = [
  {
    day: "Mon 1 Jun",
    dateIso: "2026-06-01",
    context: "E2E fixture day",
    meals: [
      { slot: "breakfast", mealId: "e2e-oats" },
      { slot: "lunch", mealId: "e2e-wrap" },
      { slot: "dinner", mealId: "e2e-bowl" },
    ],
  },
  {
    day: "Tue 2 Jun",
    dateIso: "2026-06-02",
    context: "E2E fixture day",
    meals: [
      { slot: "breakfast", mealId: "e2e-toast" },
      { slot: "lunch", mealId: "e2e-bowl" },
      { slot: "dinner", mealId: "e2e-wrap" },
    ],
  },
];

test("Fed Up flow can onboard, rescue a meal, and add a recipe", async ({ page }) => {
  // Auto-planning regenerates the plan after onboarding; pin it to local test
  // fixtures so this flow stays deterministic regardless of recommender state.
  await page.route("**/api/deadline-food/auto-plan**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: e2ePlan, meals: e2eMeals, generatedAt: "2026-06-01T00:00:00.000Z" }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /healthy meals that fit around coursework/i })).toBeVisible();
  await page.getByRole("button", { name: /start fresh|build my meal plan/i }).click();

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
  await expect(page.getByRole("heading", { name: /planning priorities/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /keep costs low/i })).toBeVisible();
  const policyPagePromise = page.context().waitForEvent("page");
  await page.getByRole("link", { name: /read the privacy policy/i }).click();
  const policyPage = await policyPagePromise;
  await policyPage.waitForLoadState();
  await expect(policyPage).toHaveURL(/\/privacy-policy$/);
  await expect(policyPage.getByRole("heading", { name: /fed up privacy policy/i })).toBeVisible();
  await expect(policyPage.getByRole("checkbox")).toHaveCount(0);
  await expect(policyPage.getByRole("button", { name: /consent and continue/i })).toHaveCount(0);
  await policyPage.close();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: /save your plan/i })).toBeVisible();
  await page.getByRole("button", { name: /continue without signing in/i }).click();

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
  await page.getByRole("button", { name: /e2e oat jar/i }).first().click();
  await expect(page.getByRole("heading", { name: /e2e oat jar/i })).toBeVisible();
  await page.getByRole("button", { name: /go back to plan/i }).click();
  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await page.getByRole("button", { name: /e2e oat jar/i }).first().click();
  await expect(page.getByRole("heading", { name: /e2e oat jar/i })).toBeVisible();
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
  await expect(page.getByText("Swapped").first()).toBeVisible();

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
  await page.getByRole("button", { name: /^add ingredient$/i }).click();
  await page.getByLabel("Ingredient").nth(1).fill("wrap");
  await page.getByLabel("Amount").nth(1).fill("1");
  await page.getByLabel("Unit").nth(1).selectOption("wrap");
  await page.getByRole("button", { name: /^add ingredient$/i }).click();
  await page.getByLabel("Ingredient").nth(2).fill("tomato");
  await page.getByLabel("Amount").nth(2).fill("50");
  await page.getByLabel("Unit").nth(2).selectOption("g");
  await page.getByLabel("Method").fill("Warm the beans.\nFill the wrap.");
  await page.getByRole("button", { name: "Add recipe", exact: true }).click();
  await expect(page.getByText("Microwave bean burrito")).toBeVisible();
  await expect(page.getByText("10 min · 100g mixed beans, 1 wrap tortilla wrap, 50g tomato")).toBeVisible();
});

test("onboarding continue without calendar shows confirmation dialog then advances to 'About you'", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /start fresh|build my meal plan/i }).click();
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
      settings: createSessionSettings({
        preferences: initialPreferences,
        deadlines: e2eDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
        privacyConsent: acceptedPrivacyConsent,
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
      settings: createSessionSettings({
        preferences: initialPreferences,
        deadlines: e2eDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
        privacyConsent: acceptedPrivacyConsent,
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

test("direct plan refresh restores nav and mocked timetable for returning users with empty persisted plan", async ({ page }) => {
  const sessionId = "empty-plan-session-39";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createSessionSettings({
        preferences: initialPreferences,
        deadlines: e2eDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
        plan: [],
        privacyConsent: acceptedPrivacyConsent,
      }),
    },
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  await page.route("**/api/deadline-food/auto-plan**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: e2ePlan, meals: e2eMeals, generatedAt: "2026-06-01T00:00:00.000Z" }),
    });
  });

  await page.goto("/#/plan");

  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  await expect(page.getByRole("button", { name: /e2e oat jar/i }).first()).toBeVisible();
});

test("dashboard meal cards have swap action that opens the swap modal", async ({ page }) => {
  const sessionId = "dashboard-swap-session-39";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createSessionSettings({
        preferences: initialPreferences,
        deadlines: e2eDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
        discoverSaved: e2eMeals,
        privacyConsent: acceptedPrivacyConsent,
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

  await page.route("**/api/deadline-food/auto-plan**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: e2ePlan, meals: e2eMeals, generatedAt: "2026-06-01T00:00:00.000Z" }),
    });
  });

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

test("auto-planning generates a multi-week plan and flags it stale when settings change", async ({ page }) => {
  const sessionId = "auto-plan-session-66";

  await page.request.put("/api/deadline-food/session", {
    data: {
      sessionId,
      settings: createSessionSettings({
        preferences: initialPreferences,
        deadlines: e2eDeadlines,
        selectedSources: ["budget", "bbc", "own", "campus"],
        onboarded: true,
        privacyConsent: acceptedPrivacyConsent,
      }),
    },
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: ANONYMOUS_SESSION_STORAGE_KEY, value: sessionId },
  );

  // Deterministic auto-plan: 8 days (so two week groups render), with a batch
  // cook on day 1 dinner seeding leftovers on day 2.
  const chilli = {
    id: "auto-chilli",
    name: "Mega Batch Chilli",
    type: "cook",
    mealSlots: ["lunch", "dinner"],
    time: 35,
    price: 2.4,
    tags: ["batch-friendly", "high protein"],
    ingredients: [{ name: "kidney beans", quantity: 200, unit: "g" }],
    allergens: [],
    nutrition: { calories: 600, protein: 30, carbs: 70, fat: 15 },
    rating: 0,
    reviews: [],
    instructions: ["Cook a big pot of chilli."],
    source: "Recommender",
    note: "",
    image: "🌶️",
  };
  const planDays = Array.from({ length: 8 }, (_unused, i) => {
    const dateIso = `2026-06-${String(i + 1).padStart(2, "0")}`;
    return {
      day: `Day ${i + 1}`,
      dateIso,
      context: i === 0 ? "Lighter day — good for batch cooking" : "Busy day — minimal prep",
      meals: [
        { slot: "dinner", mealId: "auto-chilli", ...(i === 0 ? { batchCook: true } : { leftoverOf: "auto-chilli" }) },
      ],
    };
  });

  await page.route("**/api/deadline-food/auto-plan**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: planDays, meals: [chilli], generatedAt: "2026-06-01T00:00:00.000Z" }),
    });
  });

  await page.goto("/#/plan");

  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  // Generated meal from the mocked endpoint replaces the seed plan.
  await expect(page.getByText("Mega Batch Chilli").first()).toBeVisible();
  // Two week groups => collapsible week headers appear.
  await expect(page.getByRole("button", { name: /week 1/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /week 2/i })).toBeVisible();
  // Batch-cook and leftover chaining are surfaced.
  await expect(page.getByText("Batch cook").first()).toBeVisible();
  await expect(page.getByText("Leftovers").first()).toBeVisible();

  // Changing the planning window in Settings marks the plan stale.
  await page.getByRole("button", { name: /open settings/i }).first().click();
  await expect(page.getByRole("heading", { name: /^preferences$/i })).toBeVisible();
  await page.getByRole("button", { name: "2w", exact: true }).click();
  await page.locator("header nav").getByRole("button", { name: "Meals", exact: true }).click();
  await expect(page.getByText(/regenerate to keep this plan in step/i)).toBeVisible();
});
