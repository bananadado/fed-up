import { expect, test } from "@playwright/test";

test("canonical deadline mode flow can rescue a planned meal", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /healthy, affordable meals/i })).toBeVisible();
  await page.getByRole("link", { name: /activate deadline mode/i }).click();

  await expect(page.getByRole("heading", { name: /tell the app/i })).toBeVisible();
  await page.getByLabel("Lunches").check();
  await page.getByRole("button", { name: /compare strategies/i }).click();

  await expect(page.getByRole("heading", { name: /choose the week strategy/i })).toBeVisible();
  await expect(page.getByText("Recommended")).toBeVisible();
  await page.getByRole("button", { name: /use mixed mode/i }).click();

  await expect(page.getByRole("heading", { name: /mixed mode plan/i })).toBeVisible();
  await expect(page.getByText(/projected/i)).toBeVisible();
  await expect(page.getByText("Monday lunch")).toBeVisible();

  await page.getByRole("link", { name: /view recipe for/i }).first().click();
  await expect(page.getByRole("heading", { name: /smoky bean tray bake base|bean rice bowl|smoky bean wrap/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  await page.getByRole("link", { name: /back to plan/i }).click();

  await page.getByRole("link", { name: /i have even less time today/i }).first().click();

  await expect(page.getByRole("heading", { name: /i have even less time today/i })).toBeVisible();
  await expect(page.getByText(/proposed fallback/i)).toBeVisible();
  await page.getByRole("button", { name: /confirm fallback swap/i }).click();

  await expect(page.getByRole("heading", { name: /mixed mode plan/i })).toBeVisible();
  await expect(page.getByText("rescued")).toBeVisible();
  await expect(page.getByText(/rescue_confirmed/i)).toBeVisible();
});
