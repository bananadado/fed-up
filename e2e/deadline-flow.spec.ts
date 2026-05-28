import { expect, test } from "@playwright/test";
import { defaultDeadlines, initialPreferences } from "../src/prototype/data";
import {
  ANONYMOUS_SESSION_STORAGE_KEY,
  createPrototypeSessionSettings,
} from "../src/prototype/sessionPersistence";

test("deadline food autopilot flow can onboard, rescue a meal, and add a recipe", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /healthy meals that fit around coursework/i })).toBeVisible();
  await expect(page.getByText(/meal planning for busy study weeks/i)).toBeVisible();
  await page.getByRole("button", { name: /build my meal plan/i }).click();

  await expect(page.getByRole("heading", { name: /connect your calendar/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /link google calendar/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /manual \(\.ics\)/i })).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /what works for you/i })).toBeVisible();
  await page.getByRole("button", { name: "Tofu" }).click();
  await page.getByPlaceholder("Add an ingredient you dislike").fill("Aubergine");
  await page.getByPlaceholder("Add an ingredient you dislike").press("Enter");
  await expect(page.getByRole("button", { name: "Aubergine" })).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /choose recommendation priorities/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /keep costs low/i })).toBeVisible();
  await page.getByRole("button", { name: /create my plan/i }).click();

  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
  await expect(page.getByText(/planned spend/i)).toBeVisible();
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
  await expect(page.getByText(/suggested suitable option/i)).toBeVisible();
  await expect(page.getByText(/plan total after this change/i)).toBeVisible();
  await page.getByRole("button", { name: /use suggested meal/i }).click();
  await expect(page.getByText("Rescued")).toBeVisible();

  await page.getByRole("button", { name: /recipes/i }).click();
  await expect(page.getByRole("heading", { name: /my recipes/i })).toBeVisible();
  await page.getByLabel("Recipe name").fill("Microwave bean burrito");
  await page.getByLabel("Servings").fill("3");
  await page.getByLabel("Total recipe cost (£)").fill("4.50");
  await expect(page.getByText("Estimated cost per portion: £1.50")).toBeVisible();
  await page.getByLabel("Ingredients").fill("beans, wrap, tomato");
  await page.getByLabel("Steps").fill("Warm the beans.\nFill the wrap.");
  await page.getByRole("button", { name: /add recipe/i }).click();
  await expect(page.getByText("Microwave bean burrito")).toBeVisible();
  await expect(page.getByText("10 minutes - beans, wrap, tomato")).toBeVisible();
});

test("landing CTA reopens constraint setup for returning users", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: /explore demo/i })).toHaveCount(0);

  await page.getByRole("button", { name: /build my meal plan/i }).click();

  await expect(page.getByRole("heading", { name: /connect your calendar/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /your week is covered/i })).toHaveCount(0);
});
