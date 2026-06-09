import type { DeadlineBootstrap, PlanningConstraints, ProductMeta } from "@/domain/types";
import { seededMeals } from "./seededMeals";

export const canonicalConstraints: PlanningConstraints = {
  budgetPence: 2400,
  deadlineDays: ["monday", "wednesday", "thursday"],
  lateCampusDays: ["wednesday", "thursday"],
  maxPrepMinutes: 20,
  kitchenAccess: "full",
  dietaryTags: [],
  mealSlots: ["dinner"],
  preferredLocation: "library",
};

export const productMeta: ProductMeta = {
  productName: "Fed Up",
  scenarioName: "Steven's deadline week",
  disclaimer: "App meal options - availability and prices are illustrative.",
};

export const deadlineBootstrap: DeadlineBootstrap = {
  meals: seededMeals,
  canonicalConstraints,
  app: productMeta,
};
