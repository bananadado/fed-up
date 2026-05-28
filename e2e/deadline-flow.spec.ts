import { expect, test } from "@playwright/test";

test("deadline food autopilot flow can onboard, rescue a meal, and add a recipe", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /eat well, even when your schedule collapses/i })).toBeVisible();
  await page.getByRole("button", { name: /set up deadline mode/i }).click();

  await expect(page.getByRole("heading", { name: /bring in your deadlines/i })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: /ingredients/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /method/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /nutrition/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /reviews/i })).toBeVisible();
  await page.getByRole("button", { name: /edit recipe/i }).click();
  await expect(page.getByRole("heading", { name: /edit recipe/i })).toBeVisible();
  await page.getByRole("button", { name: /save recipe/i }).click();
  await expect(page.getByRole("heading", { name: /ingredients/i })).toBeVisible();
  await page.getByRole("button", { name: /back to plan/i }).click();
  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await page.getByRole("button", { name: /choose a different option/i }).first().click();
  await expect(page.getByRole("heading", { name: /choose a different option/i })).toBeVisible();
  await expect(page.getByText(/lowest-effort suitable option/i)).toBeVisible();
  await page.getByRole("button", { name: /confirm swap/i }).click();
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
