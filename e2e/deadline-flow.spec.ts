import { expect, test } from "@playwright/test";

test("deadline food autopilot flow can onboard, rescue a meal, and add a recipe", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /eat well, even when your schedule collapses/i })).toBeVisible();
  await page.getByRole("button", { name: /set up deadline mode/i }).click();

  await expect(page.getByRole("heading", { name: /bring in your deadlines/i })).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /what works for you/i })).toBeVisible();
  await page.getByRole("button", { name: "Tofu" }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /choose your recipe sources/i })).toBeVisible();
  await page.getByRole("button", { name: /create my plan/i }).click();

  await expect(page.getByRole("heading", { name: /your week is covered/i })).toBeVisible();
  await expect(page.getByText(/planned spend/i)).toBeVisible();
  await page.getByRole("button", { name: /view full plan/i }).click();

  await expect(page.getByRole("heading", { name: /planned meals/i })).toBeVisible();
  await page.getByRole("button", { name: /choose a different option/i }).first().click();
  await expect(page.getByRole("heading", { name: /choose a different option/i })).toBeVisible();
  await expect(page.getByText(/lowest-effort suitable option/i)).toBeVisible();
  await page.getByRole("button", { name: /confirm swap/i }).click();
  await expect(page.getByText("Rescued")).toBeVisible();

  await page.getByRole("button", { name: /recipes/i }).click();
  await expect(page.getByRole("heading", { name: /my recipes/i })).toBeVisible();
  await page.getByLabel("Recipe name").fill("Microwave bean burrito");
  await page.getByRole("button", { name: /add recipe/i }).click();
  await expect(page.getByText("Microwave bean burrito")).toBeVisible();
});
