import { describe, expect, test } from "bun:test";

import { canonicalConstraints } from "@/data/seededScenario";
import { seededMeals } from "@/data/seededMeals";
import { validateConstraints } from "./constraints";
import { generatePlan } from "./planGenerator";
import { rankStrategies } from "./recommendationRules";
import { applyRescueSwap, findRescueOptions } from "./rescuePlanner";
import type { PlanningConstraints } from "./types";

describe("deadline food domain logic", () => {
  test("validates the canonical constraints", () => {
    expect(validateConstraints(canonicalConstraints)).toEqual({ valid: true, errors: [] });
  });

  test("recommends Mixed Mode for the canonical deadline scenario", () => {
    const ranked = rankStrategies(canonicalConstraints, seededMeals);

    expect(ranked[0]?.strategy).toBe("mixed");
  });

  test("recommends No-Cook Rescue when kitchen access is none", () => {
    const constraints: PlanningConstraints = {
      ...canonicalConstraints,
      kitchenAccess: "none",
      maxPrepMinutes: 0,
    };
    const ranked = rankStrategies(constraints, seededMeals);

    expect(ranked[0]?.strategy).toBe("no-cook-rescue");
  });

  test("recommends Prep Once when budget is tight and prep is possible", () => {
    const constraints: PlanningConstraints = {
      ...canonicalConstraints,
      budgetPence: 2000,
      lateCampusDays: [],
      maxPrepMinutes: 20,
      kitchenAccess: "full",
    };
    const ranked = rankStrategies(constraints, seededMeals);

    expect(ranked[0]?.strategy).toBe("prep-once");
  });

  test("filters incompatible dietary options from generated plans", () => {
    const vegetarianPlan = generatePlan({ ...canonicalConstraints, dietaryTags: ["vegetarian"] }, "mixed", seededMeals);

    expect(vegetarianPlan.days.every(day => day.meal.dietaryTags.includes("vegetarian") || day.meal.dietaryTags.includes("vegan"))).toBe(
      true,
    );
  });

  test("generated totals equal the sum of planned meals", () => {
    const plan = generatePlan(canonicalConstraints, "mixed", seededMeals);
    const expectedTotal = plan.days.reduce((sum, day) => sum + day.meal.pricePence, 0);

    expect(plan.totalCostPence).toBe(expectedTotal);
  });

  test("can generate lunch and dinner entries when lunches are selected", () => {
    const plan = generatePlan({ ...canonicalConstraints, mealSlots: ["lunch", "dinner"], budgetPence: 4500 }, "mixed", seededMeals);

    expect(plan.days).toHaveLength(10);
    expect(plan.days.some(day => day.mealSlot === "lunch")).toBe(true);
    expect(plan.days.some(day => day.dayId === "monday-lunch")).toBe(true);
  });

  test("rescue substitution updates only the chosen day", () => {
    const plan = generatePlan(canonicalConstraints, "mixed", seededMeals);
    const proposal = findRescueOptions(plan, "tuesday", seededMeals)[0];

    expect(proposal).toBeDefined();

    const rescued = applyRescueSwap(plan, proposal!);

    expect(rescued.days.find(day => day.dayId === "tuesday")?.meal.id).toBe(proposal?.replacement.id);
    expect(rescued.days.filter(day => day.wasRescued)).toHaveLength(1);
    expect(rescued.days.find(day => day.dayId === "monday")?.meal.id).toBe(plan.days.find(day => day.dayId === "monday")?.meal.id);
  });

  test("rescue substitution recalculates total cost and budget remaining", () => {
    const plan = generatePlan(canonicalConstraints, "mixed", seededMeals);
    const proposal = findRescueOptions(plan, "tuesday", seededMeals)[0]!;
    const rescued = applyRescueSwap(plan, proposal);
    const expectedTotal = rescued.days.reduce((sum, day) => sum + day.meal.pricePence, 0);

    expect(rescued.totalCostPence).toBe(expectedTotal);
    expect(proposal.newBudgetDifferencePence).toBe(canonicalConstraints.budgetPence - proposal.newTotalCostPence);
  });

  test("surfaces an over-budget rescue proposal honestly", () => {
    const tightPlan = generatePlan({ ...canonicalConstraints, budgetPence: 2100 }, "mixed", seededMeals);
    const proposal = findRescueOptions(tightPlan, "tuesday", seededMeals)[0]!;

    expect(proposal.newBudgetDifferencePence).toBeLessThan(0);
  });
});
