import type { DeadlineBootstrap, MealOption, PlanningConstraints } from "@/domain/types";

export async function fetchDeadlineBootstrap(): Promise<DeadlineBootstrap> {
  const response = await fetch("/api/deadline-food/bootstrap");

  if (!response.ok) {
    throw new Error(`Bootstrap request failed with ${response.status}`);
  }

  return response.json() as Promise<DeadlineBootstrap>;
}

export async function fetchSeededMeals(): Promise<MealOption[]> {
  const response = await fetch("/api/deadline-food/meals");

  if (!response.ok) {
    throw new Error(`Meal catalogue request failed with ${response.status}`);
  }

  return response.json() as Promise<MealOption[]>;
}

export async function fetchCanonicalScenario(): Promise<PlanningConstraints> {
  const response = await fetch("/api/deadline-food/scenario");

  if (!response.ok) {
    throw new Error(`Scenario request failed with ${response.status}`);
  }

  return response.json() as Promise<PlanningConstraints>;
}
