import type { MealOption, MealSlot, PlanningConstraints, ValidationResult } from "./types";

export const planningWeekDays = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
export const mealSlots: MealSlot[] = ["lunch", "dinner"];

const dayLabels: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

export function validateConstraints(input: PlanningConstraints): ValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(input.budgetPence) || input.budgetPence <= 0) {
    errors.push("Enter a positive food budget.");
  }

  if (!Number.isFinite(input.maxPrepMinutes) || input.maxPrepMinutes < 0) {
    errors.push("Enter a preparation time of zero minutes or more.");
  }

  if (input.deadlineDays.length === 0) {
    errors.push("Select at least one deadline-heavy day.");
  }

  if (input.mealSlots.length === 0) {
    errors.push("Choose at least one meal to plan.");
  }

  if (!["full", "limited", "none"].includes(input.kitchenAccess)) {
    errors.push("Choose a kitchen access option.");
  }

  return { valid: errors.length === 0, errors };
}

export function getPlanningDayIds(): string[] {
  return [...planningWeekDays];
}

export function formatDayLabel(dayId: string): string {
  return dayLabels[dayId] ?? dayId;
}

export function formatMealSlotLabel(slot: MealSlot): string {
  return slot === "lunch" ? "Lunch" : "Dinner";
}

export function formatPlanItemLabel(dayId: string, slot: MealSlot): string {
  return `${formatDayLabel(dayId)} ${formatMealSlotLabel(slot).toLowerCase()}`;
}

export function getContextTags(dayId: string, constraints: PlanningConstraints): string[] {
  const tags: string[] = [];

  if (constraints.deadlineDays.includes(dayId)) {
    tags.push("deadline day");
  }

  if (constraints.lateCampusDays.includes(dayId)) {
    tags.push("late library day");
  }

  return tags.length > 0 ? tags : ["steady study day"];
}

export function matchesDietaryTags(meal: MealOption, requiredTags: string[]): boolean {
  return requiredTags.every(tag => {
    if (tag === "vegetarian") {
      return meal.dietaryTags.includes("vegetarian") || meal.dietaryTags.includes("vegan");
    }

    return meal.dietaryTags.includes(tag);
  });
}

export function canCook(constraints: PlanningConstraints): boolean {
  return constraints.kitchenAccess !== "none" && constraints.maxPrepMinutes >= 10;
}

export function canPrepareBase(constraints: PlanningConstraints, meal: MealOption): boolean {
  return constraints.kitchenAccess !== "none" && meal.prepMinutes <= constraints.maxPrepMinutes;
}

export function getMealSlotsForConstraints(constraints: PlanningConstraints): MealSlot[] {
  return constraints.mealSlots.length > 0 ? constraints.mealSlots : ["dinner"];
}

export function createPlannedMealId(dayId: string, slot: MealSlot, constraints: PlanningConstraints): string {
  const slots = getMealSlotsForConstraints(constraints);

  return slots.length === 1 && slot === "dinner" ? dayId : `${dayId}-${slot}`;
}

export function sortByPreferredFallback(
  meals: MealOption[],
  constraints: PlanningConstraints,
  projectedTotalWithoutCandidate: number,
): MealOption[] {
  return [...meals].sort((a, b) => {
    const aInBudget = projectedTotalWithoutCandidate + a.pricePence <= constraints.budgetPence ? 0 : 1;
    const bInBudget = projectedTotalWithoutCandidate + b.pricePence <= constraints.budgetPence ? 0 : 1;
    const aLocation = a.location === constraints.preferredLocation ? 0 : 1;
    const bLocation = b.location === constraints.preferredLocation ? 0 : 1;

    return (
      aInBudget - bInBudget ||
      aLocation - bLocation ||
      a.prepMinutes - b.prepMinutes ||
      a.pricePence - b.pricePence
    );
  });
}
