import { describe, expect, test } from "bun:test";

import { canonicalConstraints } from "@/data/seededScenario";
import { validateConstraints } from "./constraints";
import { generatePlan } from "./planGenerator";
import { rankStrategies } from "./recommendationRules";
import { applyRescueSwap, findRescueOptions } from "./rescuePlanner";
import type { MealOption, PlanningConstraints } from "./types";

function testMeal(partial: Partial<MealOption> & { id: string; name: string; mealType: MealOption["mealType"] }): MealOption {
  return {
    mealSlots: ["lunch", "dinner"],
    pricePence: 300,
    prepMinutes: 5,
    dietaryTags: ["vegetarian", "vegan"],
    suitabilityTags: [],
    recipe: {
      summary: `${partial.name} fixture`,
      ingredients: [{ name: "beans", quantity: 1, unit: "serving" }],
      steps: ["Prepare the fixture meal."],
      whyItFits: "It keeps domain tests deterministic.",
    },
    ...partial,
  };
}

const testMeals: MealOption[] = [
  testMeal({
    id: "test-prep-base",
    name: "Test Prep Base",
    mealType: "prep_base",
    pricePence: 540,
    prepMinutes: 20,
  }),
  testMeal({
    id: "test-remix-wrap",
    name: "Test Remix Wrap",
    mealType: "remix",
    pricePence: 340,
    prepMinutes: 4,
    derivesFromPrepBaseId: "test-prep-base",
  }),
  testMeal({
    id: "test-remix-bowl",
    name: "Test Remix Bowl",
    mealType: "remix",
    pricePence: 360,
    prepMinutes: 5,
    derivesFromPrepBaseId: "test-prep-base",
  }),
  testMeal({
    id: "test-quick-rice",
    name: "Test Quick Rice",
    mealType: "quick_cook",
    pricePence: 300,
    prepMinutes: 10,
  }),
  testMeal({
    id: "test-library-fallback",
    name: "Test Library Fallback",
    mealType: "fallback",
    pricePence: 900,
    prepMinutes: 2,
    location: "library",
  }),
  testMeal({
    id: "test-campus-fallback",
    name: "Test Campus Fallback",
    mealType: "fallback",
    pricePence: 950,
    prepMinutes: 4,
    location: "campus",
  }),
];

describe("deadline food domain logic", () => {
  test("validates the canonical constraints", () => {
    expect(validateConstraints(canonicalConstraints)).toEqual({ valid: true, errors: [] });
  });

  test("recommends Mixed Mode for the canonical deadline scenario", () => {
    const ranked = rankStrategies(canonicalConstraints, testMeals);

    expect(ranked[0]?.strategy).toBe("mixed");
  });

  test("recommends No-Cook Rescue when kitchen access is none", () => {
    const constraints: PlanningConstraints = {
      ...canonicalConstraints,
      kitchenAccess: "none",
      maxPrepMinutes: 0,
    };
    const ranked = rankStrategies(constraints, testMeals);

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
    const ranked = rankStrategies(constraints, testMeals);

    expect(ranked[0]?.strategy).toBe("prep-once");
  });

  test("filters incompatible dietary options from generated plans", () => {
    const vegetarianPlan = generatePlan({ ...canonicalConstraints, dietaryTags: ["vegetarian"] }, "mixed", testMeals);

    expect(vegetarianPlan.days.every(day => day.meal.dietaryTags.includes("vegetarian") || day.meal.dietaryTags.includes("vegan"))).toBe(
      true,
    );
  });

  test("generated totals equal the sum of planned meals", () => {
    const plan = generatePlan(canonicalConstraints, "mixed", testMeals);
    const expectedTotal = plan.days.reduce((sum, day) => sum + day.meal.pricePence, 0);

    expect(plan.totalCostPence).toBe(expectedTotal);
  });

  test("can generate lunch and dinner entries when lunches are selected", () => {
    const plan = generatePlan({ ...canonicalConstraints, mealSlots: ["lunch", "dinner"], budgetPence: 4500 }, "mixed", testMeals);

    expect(plan.days).toHaveLength(10);
    expect(plan.days.some(day => day.mealSlot === "lunch")).toBe(true);
    expect(plan.days.some(day => day.dayId === "monday-lunch")).toBe(true);
  });

  test("rescue substitution updates only the chosen day", () => {
    const plan = generatePlan(canonicalConstraints, "mixed", testMeals);
    const proposal = findRescueOptions(plan, "tuesday", testMeals)[0];

    expect(proposal).toBeDefined();

    const rescued = applyRescueSwap(plan, proposal!);

    expect(rescued.days.find(day => day.dayId === "tuesday")?.meal.id).toBe(proposal?.replacement.id);
    expect(rescued.days.filter(day => day.wasRescued)).toHaveLength(1);
    expect(rescued.days.find(day => day.dayId === "monday")?.meal.id).toBe(plan.days.find(day => day.dayId === "monday")?.meal.id);
  });

  test("rescue substitution recalculates total cost and budget remaining", () => {
    const plan = generatePlan(canonicalConstraints, "mixed", testMeals);
    const proposal = findRescueOptions(plan, "tuesday", testMeals)[0]!;
    const rescued = applyRescueSwap(plan, proposal);
    const expectedTotal = rescued.days.reduce((sum, day) => sum + day.meal.pricePence, 0);

    expect(rescued.totalCostPence).toBe(expectedTotal);
    expect(proposal.newBudgetDifferencePence).toBe(canonicalConstraints.budgetPence - proposal.newTotalCostPence);
  });

  test("surfaces an over-budget rescue proposal honestly", () => {
    const tightPlan = generatePlan({ ...canonicalConstraints, budgetPence: 2100 }, "mixed", testMeals);
    const proposal = findRescueOptions(tightPlan, "tuesday", testMeals)[0]!;

    expect(proposal.newBudgetDifferencePence).toBeLessThan(0);
  });
});
