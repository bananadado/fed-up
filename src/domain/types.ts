export type MealType = "prep_base" | "remix" | "quick_cook" | "fallback";

export type MealSlot = "lunch" | "dinner";

export type KitchenAccess = "full" | "limited" | "none";

export type PlanStrategy = "prep-once" | "mixed" | "no-cook-rescue";

export type PlanningConstraints = {
  budgetPence: number;
  deadlineDays: string[];
  lateCampusDays: string[];
  maxPrepMinutes: number;
  kitchenAccess: KitchenAccess;
  dietaryTags: string[];
  mealSlots: MealSlot[];
  preferredLocation?: string;
};

export type RecipeDetails = {
  summary: string;
  ingredients: string[];
  steps: string[];
  prepNotes?: string;
  storage?: string;
  whyItFits: string;
};

export type MealOption = {
  id: string;
  name: string;
  mealType: MealType;
  mealSlots: MealSlot[];
  pricePence: number;
  prepMinutes: number;
  dietaryTags: string[];
  suitabilityTags: string[];
  recipe: RecipeDetails;
  location?: string;
  provider?: string;
  derivesFromPrepBaseId?: string;
  illustrativeOnly?: boolean;
};

export type PlannedMeal = {
  dayId: string;
  calendarDayId: string;
  mealSlot: MealSlot;
  dateLabel: string;
  contextTags: string[];
  meal: MealOption;
  originalMeal?: MealOption;
  wasRescued: boolean;
};

export type WeeklyPlan = {
  id: string;
  strategy: PlanStrategy;
  constraints: PlanningConstraints;
  days: PlannedMeal[];
  totalCostPence: number;
  budgetPence: number;
  totalPrepMinutes: number;
  explanation: string;
};

export type RescueProposal = {
  dayId: string;
  originalMeal: MealOption;
  replacement: MealOption;
  oldTotalCostPence: number;
  newTotalCostPence: number;
  timeSavedMinutes: number;
  newBudgetDifferencePence: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type RankedStrategy = {
  strategy: PlanStrategy;
  label: string;
  projectedCostPence: number;
  totalPrepMinutes: number;
  fallbackMealCount: number;
  reason: string;
  recommended: boolean;
};

export type PrototypeEvent =
  | { type: "deadline_mode_started"; occurredAt: string }
  | { type: "constraints_submitted"; occurredAt: string; constraints: PlanningConstraints }
  | { type: "strategy_viewed"; occurredAt: string }
  | { type: "strategy_selected"; occurredAt: string; strategy: PlanStrategy }
  | { type: "plan_generated"; occurredAt: string; plan: WeeklyPlan }
  | { type: "rescue_started"; occurredAt: string; dayId: string; proposals: RescueProposal[] }
  | { type: "rescue_confirmed"; occurredAt: string; dayId: string; replacementMealId: string; plan: WeeklyPlan }
  | { type: "constraints_edited"; occurredAt: string };

export type PrototypeMeta = {
  productName: string;
  disclaimer: string;
  scenarioName: string;
};

export type DeadlineBootstrap = {
  meals: MealOption[];
  canonicalConstraints: PlanningConstraints;
  prototype: PrototypeMeta;
};
