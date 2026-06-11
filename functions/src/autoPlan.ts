/**
 * Recipe auto-planning allocator (issue #66).
 *
 * Pure, deterministic, dependency-free meal allocation. Given the per-day
 * calendar context from the recommender's `/context/deadlines` pipeline (#65)
 * and an ordered candidate pool (the user's saved recipes first, then
 * recommender gap-fill — already ranked for cost / simplicity / ability /
 * deadline stress by `/recommend`), it lays meals across the planning horizon:
 *
 *   - Busy / high-stress days get minimal-prep meals or leftovers chained from
 *     an earlier batch cook (never framed as failure — campus fallbacks are
 *     legitimate).
 *   - Relaxed days get batch cooks that seed leftovers onto the next busy days,
 *     so a small saved-recipe pool comfortably covers a 3-week plan.
 *
 * Allergens and dietary requirements are hard filters. No LLM, no randomness — fully
 * unit-testable and explainable.
 */

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type MealType = "cook" | "remix" | "fallback";

/** Subset of the app `Meal` the allocator needs. */
export interface AllocatorMeal {
  id: string;
  type: MealType;
  mealSlots: MealSlot[];
  time: number;
  pricePence: number;
  servings?: number;
  tags: string[];
  allergens: string[];
  ingredients: { name: string }[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

/** Mirrors the recommender `DailyContext` (#65) — only the fields we use. */
export interface DayContext {
  date: string; // YYYY-MM-DD
  stress: number;
  free_evening: boolean;
  hard_deadlines: number;
  recommended_constraints: { max_prep_minutes: number };
}

export interface PlanMealOut {
  slot: MealSlot;
  mealId: string;
  batchCook?: boolean;
  leftoverOf?: string;
}

export interface PlanEntryOut {
  day: string;
  dateIso: string;
  context: string;
  meals: PlanMealOut[];
}

export interface BuildPlanInput {
  days: DayContext[];
  /** Candidate pool, pre-ordered: saved recipes first, recommender fill after. */
  pool: AllocatorMeal[];
  /** Lower-cased dislikes + allergens — hard filters. */
  avoided: string[];
  /** Canonical dietary requirements from onboarding. */
  dietary?: string[];
  /** Weekly budget cap in pence. Omit for legacy/no-budget allocation. */
  weeklyBudgetPence?: number;
  planningPriorities?: Partial<PlanningPriorities>;
  /** Changes final tie-breaks so explicit regenerations can produce alternatives. */
  variantSeed?: number;
  previousPlan?: PlanEntryOut[];
  candidateCount?: number;
  nutritionTargets?: NutritionTargets | "balanced-defaults";
  availableIngredients?: { name: string }[];
  preferred?: string[];
  disliked?: string[];
}

export interface PlanQuality {
  score: number;
  coverageScore: number;
  nutritionScore: number;
  varietyScore: number;
  budgetScore: number;
  shoppingSimplicityScore: number;
  ingredientReuseScore: number;
  regenerationChangeScore: number;
  weeklyCostPence: number;
  uniqueIngredientCount: number;
  reusedIngredientGroups: number;
  changedFlexibleSlots: number;
  uniqueLunchDinnerCount: number;
  maxConsecutiveLunchDinnerRepeats: number;
  hardVarietyViolationCount: number;
}

export interface BestPlanResult {
  plan: PlanEntryOut[];
  quality: PlanQuality;
}

export interface NutritionTargets {
  dailyCalories: number;
  dailyProtein: number;
}

export type PlanningPriorities = {
  batchCooking: "off" | "balanced" | "high";
  breakfastRoutine: "varied" | "rotate" | "repeat";
  mealRepeats: "varied" | "balanced" | "low-effort";
  ingredientReuse: "low" | "balanced" | "high";
  campusFallbacks: "off" | "when-busy" | "allowed";
};

export type ContextEventInput = {
  title: string;
  start: string;
  end?: string | null;
  all_day?: boolean;
  event_type?: "academic" | "general";
  urgency?: "low" | "medium" | "high";
  effort_hours?: number;
};

type Effort = "minimal" | "batch" | "cook";
type Band = "high" | "medium" | "low";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];
const LEFTOVER_PORTIONS = 2;
const LEFTOVER_SHELF_DAYS = 3;
const RECENT_REPEAT_DAYS = 3;
const MAX_NON_BREAKFAST_MEAL_USES_PER_WEEK = 3;
const DEFAULT_PRIORITIES: PlanningPriorities = {
  batchCooking: "balanced",
  breakfastRoutine: "repeat",
  mealRepeats: "balanced",
  ingredientReuse: "balanced",
  campusFallbacks: "when-busy",
};
const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  dailyCalories: 2100,
  dailyProtein: 90,
};

const TAG_ALIASES: Record<string, string> = {
  peanuts: "peanut",
  eggs: "egg",
};

const ANIMAL_ALLERGENS = new Set(["egg", "fish", "shellfish", "milk", "dairy"]);
const VEGETARIAN_ALLERGENS = new Set(["fish", "shellfish"]);
const DAIRY_ALLERGENS = new Set(["milk", "dairy"]);

const ANIMAL_INGREDIENT_PATTERNS = [
  "beef", "chicken", "pork", "bacon", "ham", "lamb", "turkey", "duck",
  "fish", "salmon", "tuna", "cod", "prawn", "shrimp", "shellfish",
  "egg", "milk", "cheese", "butter", "yoghurt", "yogurt", "cream", "honey",
];
const MEAT_FISH_INGREDIENT_PATTERNS = [
  "beef", "chicken", "pork", "bacon", "ham", "lamb", "turkey", "duck",
  "fish", "salmon", "tuna", "cod", "prawn", "shrimp", "shellfish",
];
const GLUTEN_INGREDIENT_PATTERNS = [
  "wheat", "barley", "rye", "flour", "bread", "pasta", "couscous",
];
const DAIRY_INGREDIENT_PATTERNS = [
  "milk", "cheese", "butter", "yoghurt", "yogurt", "cream",
];
const HALAL_INGREDIENT_PATTERNS = [
  "pork", "bacon", "ham", "lard", "gelatin", "wine", "beer", "alcohol",
];
const ACADEMIC_EVENT_PATTERN = new RegExp(
  "\\b(" +
    [
      "deadline", "coursework", "assignment", "exam", "quiz", "test",
      "submission", "assessment", "presentation", "seminar", "lecture",
      "lab", "tutorial", "study", "revision", "review",
    ].join("|") +
    ")\\b",
  "i",
);

function dateFromEventValue(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDateFromEventStart(start: string): string | null {
  const trimmed = start.trim();
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix?.[1]) return isoPrefix[1];

  return dateFromEventValue(trimmed)?.toISOString().slice(0, 10) ?? null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function eventDurationHours(event: ContextEventInput): number {
  if (event.all_day) return 8;
  const start = dateFromEventValue(event.start);
  const end = typeof event.end === "string" && event.end.trim() ? dateFromEventValue(event.end) : null;
  if (!start || !end || end <= start) return 1;
  return Math.min(12, Math.max(0.5, (end.getTime() - start.getTime()) / 3_600_000));
}

function startsInEvening(start: string): boolean {
  const match = start.match(/T(\d{2}):/);
  if (!match?.[1]) return false;
  return Number(match[1]) >= 17;
}

function contextEventPressure(event: ContextEventInput): {
  stress: number;
  hardDeadline: boolean;
  maxPrep: number;
  freeEvening: boolean;
  durationHours: number;
} {
  const title = event.title.trim();
  const durationHours = eventDurationHours(event);
  const academic = event.event_type === "academic" || ACADEMIC_EVENT_PATTERN.test(title);
  const hardDeadline =
    event.urgency === "high" ||
    /\b(deadline|exam|quiz|test|submission|assessment)\b/i.test(title);

  let stress = 0.42;
  if (academic) stress = 0.62;
  if (event.urgency === "medium") stress = Math.max(stress, 0.68);
  if (hardDeadline) stress = Math.max(stress, 0.86);
  if (Number.isFinite(event.effort_hours)) {
    const effort = Math.max(0, event.effort_hours ?? 0);
    if (effort >= 6) stress = Math.max(stress, 0.88);
    else if (effort >= 3) stress = Math.max(stress, 0.72);
  }
  if (durationHours >= 6) stress = Math.max(stress, 0.88);
  else if (durationHours >= 4) stress = Math.max(stress, 0.78);
  else if (durationHours >= 2) stress = Math.max(stress, 0.62);

  const maxPrep = stress >= 0.8 ? 15 : stress >= 0.62 ? 30 : 45;
  const freeEvening = stress < 0.62 && !event.all_day && !startsInEvening(event.start);
  return {stress, hardDeadline, maxPrep, freeEvening, durationHours};
}

export function localDaysFromContextEvents(events: ContextEventInput[], horizonDays: number): DayContext[] {
  const today = new Date();
  const dayCount = Math.max(1, Math.round(horizonDays));
  const days: DayContext[] = Array.from({length: dayCount}, (_, index) => {
    const date = addDays(today, index).toISOString().slice(0, 10);
    return {
      date,
      stress: 0.3,
      free_evening: true,
      hard_deadlines: 0,
      recommended_constraints: {max_prep_minutes: 60},
    };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));
  const loadByDate = new Map<string, {count: number; durationHours: number}>();

  for (const event of events) {
    const raw = event as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const candidate = raw as Partial<ContextEventInput>;
    if (typeof candidate.title !== "string" || typeof candidate.start !== "string") continue;
    const date = isoDateFromEventStart(candidate.start);
    if (date === null) continue;
    const day = byDate.get(date);
    if (!day) continue;

    const pressure = contextEventPressure({
      title: candidate.title,
      start: candidate.start,
      end: candidate.end,
      all_day: candidate.all_day,
      event_type: candidate.event_type,
      urgency: candidate.urgency,
      effort_hours: candidate.effort_hours,
    });
    const load = loadByDate.get(date) ?? {count: 0, durationHours: 0};
    load.count += 1;
    load.durationHours += pressure.durationHours;
    loadByDate.set(date, load);

    day.stress = Math.min(1, Math.max(day.stress, pressure.stress));
    day.free_evening = day.free_evening && pressure.freeEvening;
    day.hard_deadlines += pressure.hardDeadline ? 1 : 0;
    day.recommended_constraints.max_prep_minutes = Math.min(
      day.recommended_constraints.max_prep_minutes,
      pressure.maxPrep,
    );
  }

  for (const [date, load] of loadByDate) {
    const day = byDate.get(date);
    if (!day) continue;
    const densityStress =
      load.durationHours >= 7 || load.count >= 5 ? 0.9 :
        load.durationHours >= 5 || load.count >= 4 ? 0.82 :
          load.durationHours >= 3 || load.count >= 3 ? 0.7 :
            load.durationHours >= 2 || load.count >= 2 ? 0.58 :
              0;
    if (densityStress > 0) {
      day.stress = Math.min(1, Math.max(day.stress, densityStress));
      day.recommended_constraints.max_prep_minutes = Math.min(
        day.recommended_constraints.max_prep_minutes,
        densityStress >= 0.8 ? 15 : densityStress >= 0.62 ? 30 : 45,
      );
      if (densityStress >= 0.62) day.free_evening = false;
    }
  }

  return days;
}

export function mergeCalendarPressure(
  days: DayContext[],
  events: ContextEventInput[],
  horizonDays: number,
): DayContext[] {
  if (events.length === 0) return days;
  const localDays = localDaysFromContextEvents(events, horizonDays);
  const localByDate = new Map(localDays.map((day) => [day.date, day]));

  return days.map((day) => {
    const local = localByDate.get(day.date);
    if (!local) return day;
    return {
      ...day,
      stress: Math.max(day.stress, local.stress),
      free_evening: day.free_evening && local.free_evening,
      hard_deadlines: Math.max(day.hard_deadlines, local.hard_deadlines),
      recommended_constraints: {
        max_prep_minutes: Math.min(
          day.recommended_constraints?.max_prep_minutes ?? 60,
          local.recommended_constraints.max_prep_minutes,
        ),
      },
    };
  });
}

function canonicalTag(value: string): string {
  const tag = value.trim().toLowerCase().replace(/\s+/g, " ");
  return TAG_ALIASES[tag] ?? tag;
}

function canonicalTags(values: string[]): string[] {
  return [...new Set(values.map(canonicalTag).filter(Boolean))];
}

function normalizePriorities(value: Partial<PlanningPriorities> | undefined): PlanningPriorities {
  return {
    batchCooking: value?.batchCooking === "off" || value?.batchCooking === "high" ?
      value.batchCooking :
      DEFAULT_PRIORITIES.batchCooking,
    breakfastRoutine: value?.breakfastRoutine === "varied" || value?.breakfastRoutine === "rotate" ?
      value.breakfastRoutine :
      DEFAULT_PRIORITIES.breakfastRoutine,
    mealRepeats: value?.mealRepeats === "varied" || value?.mealRepeats === "low-effort" ?
      value.mealRepeats :
      DEFAULT_PRIORITIES.mealRepeats,
    ingredientReuse: value?.ingredientReuse === "low" || value?.ingredientReuse === "high" ?
      value.ingredientReuse :
      DEFAULT_PRIORITIES.ingredientReuse,
    campusFallbacks: value?.campusFallbacks === "off" || value?.campusFallbacks === "allowed" ?
      value.campusFallbacks :
      DEFAULT_PRIORITIES.campusFallbacks,
  };
}

function includesAnyPattern(value: string, patterns: string[]): boolean {
  const normalized = canonicalTag(value);
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function classifyEffort(meal: AllocatorMeal): Effort {
  if (meal.type === "fallback") return "minimal";
  const tags = meal.tags.map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes("batch"))) return "batch";
  if (meal.type === "remix") return "minimal";
  if (tags.includes("no cooking") || tags.includes("quick") || meal.time <= 10) return "minimal";
  return "cook";
}

function band(stress: number): Band {
  if (stress >= 0.66) return "high";
  if (stress >= 0.4) return "medium";
  return "low";
}

function isSafe(meal: AllocatorMeal, avoided: Set<string>): boolean {
  if (avoided.size === 0) return true;
  if (meal.ingredients.some((i) => avoided.has(canonicalTag(i.name || "")))) return false;
  if (meal.allergens.some((a) => avoided.has(canonicalTag(a)))) return false;
  return true;
}

function hasTag(meal: AllocatorMeal, tag: string): boolean {
  return canonicalTags(meal.tags).includes(tag);
}

function hasAnyAllergen(meal: AllocatorMeal, allergens: Set<string>): boolean {
  return canonicalTags(meal.allergens).some((allergen) => allergens.has(allergen));
}

function hasAnyIngredient(meal: AllocatorMeal, patterns: string[]): boolean {
  return meal.ingredients.some((ingredient) => includesAnyPattern(ingredient.name || "", patterns));
}

function isDietCompatible(meal: AllocatorMeal, dietary: Set<string>): boolean {
  if (dietary.has("vegan")) {
    if (!hasTag(meal, "vegan")) return false;
    if (hasAnyAllergen(meal, ANIMAL_ALLERGENS)) return false;
    if (hasAnyIngredient(meal, ANIMAL_INGREDIENT_PATTERNS)) return false;
  } else if (dietary.has("vegetarian")) {
    if (!hasTag(meal, "vegetarian") && !hasTag(meal, "vegan")) return false;
    if (hasAnyAllergen(meal, VEGETARIAN_ALLERGENS)) return false;
    if (hasAnyIngredient(meal, MEAT_FISH_INGREDIENT_PATTERNS)) return false;
  }

  if (dietary.has("gluten-free") && hasAnyIngredient(meal, GLUTEN_INGREDIENT_PATTERNS)) return false;
  if (dietary.has("dairy-free")) {
    if (hasAnyAllergen(meal, DAIRY_ALLERGENS)) return false;
    if (hasAnyIngredient(meal, DAIRY_INGREDIENT_PATTERNS)) return false;
  }
  if (dietary.has("halal")) {
    if (!hasTag(meal, "halal") && !hasTag(meal, "vegetarian") && !hasTag(meal, "vegan")) return false;
    if (hasAnyIngredient(meal, HALAL_INGREDIENT_PATTERNS)) return false;
  }

  return true;
}

function dayLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short"});
}

function contextLabel(day: DayContext, b: Band): string {
  if (day.hard_deadlines > 0) return "Deadline day — quick wins";
  if (b === "high") return "Busy day — minimal prep";
  if (b === "medium") return "Moderate study load";
  return "Lighter day — good for batch cooking";
}

type Leftover = {meal: AllocatorMeal; expiresDayIndex: number};

function mealCostPence(meal: AllocatorMeal): number {
  return Math.max(0, Math.round(meal.pricePence));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function ingredientKeys(meal: AllocatorMeal): string[] {
  return canonicalTags(meal.ingredients.map((ingredient) => ingredient.name || ""));
}

function nutritionValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeNutritionTargets(value: BuildPlanInput["nutritionTargets"]): NutritionTargets {
  if (value === "balanced-defaults" || value === undefined) return DEFAULT_NUTRITION_TARGETS;
  const dailyCalories = Number.isFinite(value.dailyCalories) ?
    value.dailyCalories :
    DEFAULT_NUTRITION_TARGETS.dailyCalories;
  const dailyProtein = Number.isFinite(value.dailyProtein) ?
    value.dailyProtein :
    DEFAULT_NUTRITION_TARGETS.dailyProtein;
  return {
    dailyCalories: Math.min(4000, Math.max(1200, Math.round(dailyCalories))),
    dailyProtein: Math.min(250, Math.max(30, Math.round(dailyProtein))),
  };
}

function slotNutritionTarget(slot: MealSlot, targets: NutritionTargets): { calories: number; protein: number } {
  if (slot === "breakfast") {
    return {calories: targets.dailyCalories * 0.25, protein: targets.dailyProtein * 0.25};
  }
  if (slot === "lunch") {
    return {calories: targets.dailyCalories * 0.35, protein: targets.dailyProtein * 0.35};
  }
  return {calories: targets.dailyCalories * 0.40, protein: targets.dailyProtein * 0.40};
}

function ingredientOverlapScore(meal: AllocatorMeal, weekIngredients: Map<string, number>): number {
  if (weekIngredients.size === 0) return 0;
  return ingredientKeys(meal).reduce((score, key) => score + (weekIngredients.has(key) ? 1 : 0), 0);
}

function ingredientReuseRank(
  meal: AllocatorMeal,
  weekIngredients: Map<string, number>,
  priorities: PlanningPriorities,
): number {
  if (priorities.ingredientReuse === "low") return 0;
  const score = ingredientOverlapScore(meal, weekIngredients);
  return priorities.ingredientReuse === "high" ? score * 2 : score;
}

function recordWeekIngredients(meal: AllocatorMeal, weekIngredients: Map<string, number>): void {
  for (const key of ingredientKeys(meal)) {
    weekIngredients.set(key, (weekIngredients.get(key) ?? 0) + 1);
  }
}

function variantRank(meal: AllocatorMeal, slot: MealSlot, dayIndex: number, variantSeed: number | undefined): number {
  if (variantSeed === undefined || !Number.isFinite(variantSeed)) return 0;
  let hash = Math.max(0, Math.round(variantSeed));
  const value = `${slot}:${dayIndex}:${meal.id}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function allowsFallback(meal: AllocatorMeal, priorities: PlanningPriorities, b: Band, day: DayContext): boolean {
  if (meal.type !== "fallback") return true;
  if (priorities.campusFallbacks === "off") return false;
  if (priorities.campusFallbacks === "allowed") return true;
  return b === "high" || day.hard_deadlines > 0;
}

function leftoverPortions(meal: AllocatorMeal, priorities: PlanningPriorities): number {
  if (priorities.batchCooking === "off") return 0;
  if (priorities.batchCooking === "high") return Math.max(3, Math.round(meal.servings ?? 0) - 1);
  return LEFTOVER_PORTIONS;
}

function isBatchSlot(
  meal: AllocatorMeal,
  priorities: PlanningPriorities,
  b: Band,
  day: DayContext,
  slot: MealSlot,
): boolean {
  if (priorities.batchCooking === "off" || slot === "breakfast") return false;
  if (classifyEffort(meal) !== "batch") return false;
  if (b === "low") return true;
  return priorities.batchCooking === "high" && b === "medium" && day.free_evening;
}

function wouldCreateMainMealRepeat(meal: AllocatorMeal, slot: MealSlot, mainMealHistory: string[]): boolean {
  if (slot === "breakfast") return false;
  const last = mainMealHistory[mainMealHistory.length - 1];
  const previous = mainMealHistory[mainMealHistory.length - 2];
  return last === meal.id && previous === meal.id;
}

function weeklyMealUseKey(weekIndex: number, mealId: string): string {
  return `${weekIndex}:${mealId}`;
}

function wouldExceedWeeklyNonBreakfastLimit(
  meal: AllocatorMeal,
  slot: MealSlot,
  weekIndex: number,
  weeklyMealUseCounts: Map<string, number>,
): boolean {
  if (slot === "breakfast") return false;
  return (weeklyMealUseCounts.get(weeklyMealUseKey(weekIndex, meal.id)) ?? 0) >=
    MAX_NON_BREAKFAST_MEAL_USES_PER_WEEK;
}

function remainingFillableSlotsInWeek(
  daysLength: number,
  dayIndex: number,
  slot: MealSlot,
  pool: AllocatorMeal[],
): number {
  const slotIndex = SLOTS.indexOf(slot);
  const weekEndIndex = Math.min(daysLength, Math.floor(dayIndex / 7) * 7 + 7);
  let count = 0;

  for (let d = dayIndex; d < weekEndIndex; d += 1) {
    const startSlot = d === dayIndex ? slotIndex : 0;
    for (let s = startSlot; s < SLOTS.length; s += 1) {
      const candidateSlot = SLOTS[s];
      if (candidateSlot && pool.some((meal) => meal.mealSlots.includes(candidateSlot))) {
        count += 1;
      }
    }
  }

  return Math.max(1, count);
}

// Rank candidates for a slot by how well their effort suits the day's band.
function effortRank(effort: Effort, b: Band, slot: MealSlot, priorities: PlanningPriorities): number {
  if (b === "high") {
    // Crunch day: minimal prep first, never a from-scratch cook.
    return effort === "minimal" ? 0 : effort === "batch" ? 2 : 3;
  }
  if (b === "medium" && priorities.batchCooking === "high" && slot !== "breakfast") {
    return effort === "batch" ? 0 : effort === "minimal" ? 1 : 2;
  }
  if (b === "low" && slot !== "breakfast") {
    // Relaxed evening: prefer a batch cook so it seeds leftovers.
    return effort === "batch" ? 0 : effort === "cook" ? 1 : 2;
  }
  // Medium / breakfast: anything that fits, mild preference for lighter prep.
  return effort === "minimal" ? 0 : effort === "batch" ? 1 : 2;
}

export function buildPlan(input: BuildPlanInput): PlanEntryOut[] {
  const priorities = normalizePriorities(input.planningPriorities);
  const avoided = new Set(canonicalTags(input.avoided));
  const dietary = new Set(canonicalTags(input.dietary ?? []));
  const preferred = new Set(canonicalTags(input.preferred ?? []));
  const disliked = new Set(canonicalTags(input.disliked ?? []));
  const safePool = input.pool.filter((m) => isSafe(m, avoided) && isDietCompatible(m, dietary));
  const weeklyBudgetPence =
    input.weeklyBudgetPence === undefined || !Number.isFinite(input.weeklyBudgetPence) ?
      null :
      Math.max(0, Math.round(input.weeklyBudgetPence));

  const leftovers: Leftover[] = [];
  // Last day index a meal was used in a given slot, to avoid back-to-back repeats.
  const lastUsed = new Map<string, number>(); // `${slot}:${mealId}` -> dayIndex
  const mealUseCounts = new Map<string, number>();
  const slotUseCounts = new Map<string, number>();
  const weeklyMealUseCounts = new Map<string, number>();
  const spentByWeek = new Map<number, number>();
  const ingredientsByWeek = new Map<number, Map<string, number>>();
  const breakfastRoutineIds: string[] = [];
  const mainMealHistory: string[] = [];
  const entries: PlanEntryOut[] = [];

  input.days.forEach((day, dayIndex) => {
    const b = band(day.stress);
    const maxPrep = day.recommended_constraints?.max_prep_minutes ?? 60;
    const meals: PlanMealOut[] = [];
    const usedToday = new Set<string>();
    const weekIndex = Math.floor(dayIndex / 7);
    const weekIngredients = ingredientsByWeek.get(weekIndex) ?? new Map<string, number>();
    ingredientsByWeek.set(weekIndex, weekIngredients);

    for (const slot of SLOTS) {
      const remainingBudgetPence =
        weeklyBudgetPence === null ?
          Number.POSITIVE_INFINITY :
          Math.max(0, weeklyBudgetPence - (spentByWeek.get(weekIndex) ?? 0));
      const pacedBudgetPence =
        weeklyBudgetPence === null ?
          Number.POSITIVE_INFINITY :
          Math.floor(remainingBudgetPence / remainingFillableSlotsInWeek(input.days.length, dayIndex, slot, safePool));

      // 1. On busy/moderate non-breakfast slots, spend a fresh leftover first.
      if (slot !== "breakfast" && b !== "low") {
        const idx = leftovers.findIndex(
          (l) =>
            l.expiresDayIndex >= dayIndex &&
            l.meal.mealSlots.includes(slot) &&
            !usedToday.has(l.meal.id) &&
            !wouldCreateMainMealRepeat(l.meal, slot, mainMealHistory) &&
            !wouldExceedWeeklyNonBreakfastLimit(l.meal, slot, weekIndex, weeklyMealUseCounts),
        );
        if (idx !== -1) {
          const [used] = leftovers.splice(idx, 1);
          meals.push({slot, mealId: used.meal.id, leftoverOf: used.meal.id});
          recordUse({
            meal: used.meal,
            slot,
            dayIndex,
            weekIndex,
            lastUsed,
            mealUseCounts,
            slotUseCounts,
            weeklyMealUseCounts,
            spentByWeek,
            usedToday,
            mainMealHistory,
            countCost: false,
            recordIngredients: false,
          });
          continue;
        }
      }

      const candidates = safePool.filter((m) => m.mealSlots.includes(slot) && allowsFallback(m, priorities, b, day));
      const picked = pickRoutineBreakfast(
        candidates,
        priorities,
        slot,
        maxPrep,
        remainingBudgetPence,
        pacedBudgetPence,
        breakfastRoutineIds,
        dayIndex,
      ) ?? pickForSlot(
        candidates,
        b,
        slot,
        maxPrep,
        remainingBudgetPence,
        pacedBudgetPence,
        lastUsed,
        mealUseCounts,
        slotUseCounts,
        weeklyMealUseCounts,
        weekIndex,
        weekIngredients,
        priorities,
        preferred,
        disliked,
        usedToday,
        dayIndex,
        input.variantSeed,
        mainMealHistory,
      );

      if (!picked) {
        continue; // pool has nothing for this slot — leave it unfilled
      }

      if (slot === "breakfast" && priorities.breakfastRoutine !== "varied") {
        const routineIndex = priorities.breakfastRoutine === "repeat" ? Math.floor(dayIndex / 5) : dayIndex % 2;
        if (!breakfastRoutineIds[routineIndex]) {
          breakfastRoutineIds[routineIndex] = picked.id;
        }
      }

      const isBatch = isBatchSlot(picked, priorities, b, day, slot);
      meals.push({slot, mealId: picked.id, ...(isBatch ? {batchCook: true} : {})});
      recordUse({
        meal: picked,
        slot,
        dayIndex,
        weekIndex,
        lastUsed,
        mealUseCounts,
        slotUseCounts,
        weeklyMealUseCounts,
        spentByWeek,
        usedToday,
        weekIngredients,
        mainMealHistory,
      });

      if (isBatch) {
        const portions = leftoverPortions(picked, priorities);
        for (let p = 0; p < portions; p += 1) {
          leftovers.push({meal: picked, expiresDayIndex: dayIndex + LEFTOVER_SHELF_DAYS});
        }
      }
    }

    entries.push({
      day: dayLabel(day.date),
      dateIso: day.date,
      context: contextLabel(day, b),
      meals,
    });
  });

  return entries;
}

function mealById(pool: AllocatorMeal[]): Map<string, AllocatorMeal> {
  return new Map(pool.map((meal) => [meal.id, meal]));
}

function plannedMealEntries(plan: PlanEntryOut[], pool: AllocatorMeal[]): Array<{
  entry: PlanEntryOut;
  planMeal: PlanMealOut;
  meal: AllocatorMeal;
  dayIndex: number;
  weekIndex: number;
}> {
  const byId = mealById(pool);
  const out: Array<{
    entry: PlanEntryOut;
    planMeal: PlanMealOut;
    meal: AllocatorMeal;
    dayIndex: number;
    weekIndex: number;
  }> = [];

  plan.forEach((entry, dayIndex) => {
    const weekIndex = Math.floor(dayIndex / 7);
    entry.meals.forEach((planMeal) => {
      const meal = byId.get(planMeal.mealId);
      if (meal) out.push({entry, planMeal, meal, dayIndex, weekIndex});
    });
  });

  return out;
}

function nutritionScore(plan: PlanEntryOut[], pool: AllocatorMeal[], targets: NutritionTargets): number {
  const placed = plannedMealEntries(plan, pool);
  let targetCalories = 0;
  let targetProtein = 0;
  let calories = 0;
  let protein = 0;
  let known = 0;
  let dailyScoreSum = 0;
  let dailyScoreCount = 0;

  for (const entry of plan) {
    let dayTargetCalories = 0;
    let dayTargetProtein = 0;
    let dayCalories = 0;
    let dayProtein = 0;
    let dayKnown = 0;

    for (const planMeal of entry.meals) {
      const meal = placed.find((item) => item.entry === entry && item.planMeal === planMeal)?.meal;
      if (!meal) continue;
      const target = slotNutritionTarget(planMeal.slot, targets);
      targetCalories += target.calories;
      targetProtein += target.protein;
      dayTargetCalories += target.calories;
      dayTargetProtein += target.protein;
      const mealCalories = nutritionValue(meal.nutrition?.calories);
      const mealProtein = nutritionValue(meal.nutrition?.protein);
      calories += mealCalories;
      protein += mealProtein;
      dayCalories += mealCalories;
      dayProtein += mealProtein;
      if (mealCalories > 0 || mealProtein > 0) {
        known += 1;
        dayKnown += 1;
      }
    }

    if (dayTargetCalories > 0 && dayKnown > 0) {
      const dayProteinScore = clamp01(dayProtein / dayTargetProtein);
      const dayCaloriesScore = clamp01(1 - Math.abs(dayCalories - dayTargetCalories) / (dayTargetCalories * 0.55));
      dailyScoreSum += dayProteinScore * 0.65 + dayCaloriesScore * 0.35;
      dailyScoreCount += 1;
    }
  }

  if (targetCalories === 0 || known === 0) return 0.5;

  const weeklyProteinScore = clamp01(protein / targetProtein);
  const weeklyCaloriesScore = clamp01(1 - Math.abs(calories - targetCalories) / (targetCalories * 0.45));
  const dailyScore = dailyScoreCount > 0 ? dailyScoreSum / dailyScoreCount : 0.5;
  const confidence = known / Math.max(1, placed.length);
  const raw = weeklyProteinScore * 0.45 + weeklyCaloriesScore * 0.25 + dailyScore * 0.30;
  return clamp01(raw * confidence + 0.5 * (1 - confidence));
}

function purchasableMealEntries(plan: PlanEntryOut[], pool: AllocatorMeal[]) {
  return plannedMealEntries(plan, pool).filter(({planMeal}) => !planMeal.leftoverOf);
}

function weeklyCostPence(plan: PlanEntryOut[], pool: AllocatorMeal[]): number {
  return purchasableMealEntries(plan, pool).reduce((sum, {meal}) => sum + mealCostPence(meal), 0);
}

function ingredientCountsForPlan(
  plan: PlanEntryOut[],
  pool: AllocatorMeal[],
  availableIngredients: { name: string }[] = [],
): Map<string, number> {
  const available = new Set(canonicalTags(availableIngredients.map((ingredient) => ingredient.name || "")));
  const counts = new Map<string, number>();

  for (const {meal} of purchasableMealEntries(plan, pool)) {
    for (const key of ingredientKeys(meal)) {
      if (!key || available.has(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

const PERISHABLE_INGREDIENT_PATTERNS = [
  "spinach", "lettuce", "salad", "tomato", "pepper", "mushroom", "avocado",
  "berries", "berry", "banana", "apple", "yoghurt", "yogurt", "milk",
  "chicken", "fish", "salmon", "beef", "pork", "egg",
];

function isPerishableIngredient(key: string): boolean {
  return PERISHABLE_INGREDIENT_PATTERNS.some((pattern) => key.includes(pattern));
}

function shoppingSimplicityScore(
  plan: PlanEntryOut[],
  pool: AllocatorMeal[],
  availableIngredients: {name: string}[] = [],
): number {
  const counts = ingredientCountsForPlan(plan, pool, availableIngredients);
  const purchaseMeals = purchasableMealEntries(plan, pool).length;
  if (purchaseMeals === 0) return 1;
  const targetUnique = Math.max(4, Math.ceil(purchaseMeals * 2.25));
  const uniqueScore = counts.size <= targetUnique ? 1 : clamp01(1 - (counts.size - targetUnique) / targetUnique);
  const perishableCount = [...counts.keys()].filter(isPerishableIngredient).length;
  const targetPerishable = Math.max(3, Math.ceil(purchaseMeals * 0.9));
  const perishableScore = perishableCount <= targetPerishable ?
    1 :
    clamp01(1 - (perishableCount - targetPerishable) / targetPerishable);
  return uniqueScore * 0.75 + perishableScore * 0.25;
}

function ingredientReuseScore(
  plan: PlanEntryOut[],
  pool: AllocatorMeal[],
  availableIngredients: {name: string}[] = [],
): number {
  const counts = ingredientCountsForPlan(plan, pool, availableIngredients);
  if (counts.size === 0) return 0.5;
  const reused = [...counts.values()].filter((count) => count > 1).length;
  return clamp01((reused / counts.size) / 0.35);
}

function mealPreferenceOverlap(meal: AllocatorMeal, preferences: Set<string>): number {
  if (preferences.size === 0) return 0;
  const keys = new Set([
    ...ingredientKeys(meal),
    ...canonicalTags(meal.tags),
    ...canonicalTags(meal.allergens),
  ]);
  let score = 0;
  for (const preference of preferences) {
    if (keys.has(preference)) score += 1;
    else if ([...keys].some((key) => key.includes(preference) || preference.includes(key))) score += 0.5;
  }
  return score;
}

function mealDislikePenalty(meal: AllocatorMeal, disliked: Set<string>): number {
  return mealPreferenceOverlap(meal, disliked) * 2;
}

function mealLikeBoost(meal: AllocatorMeal, preferred: Set<string>): number {
  return mealPreferenceOverlap(meal, preferred);
}

function mainMealSequence(plan: PlanEntryOut[]): PlanMealOut[] {
  return plan.flatMap((entry) => entry.meals.filter((meal) => meal.slot !== "breakfast"));
}

function maxConsecutiveMainMealRepeats(plan: PlanEntryOut[]): number {
  let max = 0;
  let currentMealId = "";
  let current = 0;

  for (const meal of mainMealSequence(plan)) {
    if (meal.mealId === currentMealId) {
      current += 1;
    } else {
      currentMealId = meal.mealId;
      current = 1;
    }
    max = Math.max(max, current);
  }

  return max;
}

function weeklyNonBreakfastMealOverage(plan: PlanEntryOut[]): number {
  const counts = new Map<string, number>();

  plan.forEach((entry, dayIndex) => {
    const weekIndex = Math.floor(dayIndex / 7);
    entry.meals.forEach((meal) => {
      if (meal.slot === "breakfast") return;
      const key = weeklyMealUseKey(weekIndex, meal.mealId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return [...counts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - MAX_NON_BREAKFAST_MEAL_USES_PER_WEEK),
    0,
  );
}

function hardVarietyViolationCount(plan: PlanEntryOut[]): number {
  const maxConsecutive = maxConsecutiveMainMealRepeats(plan);
  const consecutiveViolations = maxConsecutive >= 3 ? maxConsecutive - 2 : 0;
  return consecutiveViolations + weeklyNonBreakfastMealOverage(plan);
}

function coverageScore(plan: PlanEntryOut[], days: DayContext[]): number {
  const expectedSlots = days.length * SLOTS.length;
  if (expectedSlots === 0) return 1;
  const filledSlots = plan.reduce((sum, entry) => sum + entry.meals.length, 0);
  return clamp01(filledSlots / expectedSlots);
}

function varietyScore(plan: PlanEntryOut[], priorities: PlanningPriorities): number {
  if (hardVarietyViolationCount(plan) > 0) return 0;
  const mainMeals = mainMealSequence(plan);
  const flexible = mainMeals.filter((meal) => !meal.leftoverOf);
  if (mainMeals.length === 0) return 0.7;
  const distinctMainMeals = new Set(mainMeals.map((meal) => meal.mealId)).size;
  const distinctScore = clamp01(distinctMainMeals / Math.max(3, mainMeals.length * 0.55));
  const maxConsecutive = maxConsecutiveMainMealRepeats(plan);
  const streakScore = maxConsecutive <= 1 ? 1 : 0.74;
  const sameDayRepeats = plan.filter((entry) => {
    const lunch = entry.meals.find((meal) => meal.slot === "lunch")?.mealId;
    const dinner = entry.meals.find((meal) => meal.slot === "dinner")?.mealId;
    return lunch !== undefined && lunch === dinner;
  }).length;
  const sameDayScore = clamp01(1 - sameDayRepeats / Math.max(1, plan.length));
  const dinners = flexible.filter((meal) => meal.slot === "dinner");
  const dinnerCounts = new Map<string, number>();
  dinners.forEach((meal) => dinnerCounts.set(meal.mealId, (dinnerCounts.get(meal.mealId) ?? 0) + 1));
  const repeatedDinnerSlots = [...dinnerCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const repeatPenalty =
    priorities.mealRepeats === "low-effort" ? 0 :
      priorities.mealRepeats === "varied" ? repeatedDinnerSlots * 0.10 :
        repeatedDinnerSlots * 0.06;
  return clamp01(distinctScore * 0.58 + streakScore * 0.30 + sameDayScore * 0.12 - repeatPenalty);
}

function budgetScore(plan: PlanEntryOut[], pool: AllocatorMeal[], weeklyBudgetPence: number | undefined): number {
  if (weeklyBudgetPence === undefined || !Number.isFinite(weeklyBudgetPence) || weeklyBudgetPence <= 0) return 0.85;
  const weekSpend = new Map<number, number>();
  for (const {weekIndex, meal} of purchasableMealEntries(plan, pool)) {
    weekSpend.set(weekIndex, (weekSpend.get(weekIndex) ?? 0) + mealCostPence(meal));
  }
  const ratios = [...weekSpend.values()].map((spend) => spend / weeklyBudgetPence);
  const worstRatio = ratios.length > 0 ? Math.max(...ratios) : 0;
  if (worstRatio > 1) return 0;
  if (worstRatio <= 0.9) return 1;
  return clamp01(1 - (worstRatio - 0.9) / 0.1 * 0.2);
}

function comparablePlanMealKey(entry: PlanEntryOut, meal: PlanMealOut): string {
  return `${entry.dateIso}|${meal.slot}`;
}

function isFlexibleForRegeneration(meal: PlanMealOut): boolean {
  return meal.slot !== "breakfast" && !meal.leftoverOf;
}

function regenerationChangeScore(
  plan: PlanEntryOut[],
  previousPlan: PlanEntryOut[] | undefined,
): {score: number; changed: number} {
  if (!previousPlan || previousPlan.length === 0) return {score: 0.8, changed: 0};
  const previous = new Map<string, string>();
  previousPlan.forEach((entry) => {
    entry.meals.filter(isFlexibleForRegeneration).forEach((meal) => {
      previous.set(comparablePlanMealKey(entry, meal), meal.mealId);
    });
  });

  const current = plan.flatMap((entry) =>
    entry.meals
      .filter(isFlexibleForRegeneration)
      .map((meal) => ({
        key: comparablePlanMealKey(entry, meal),
        mealId: meal.mealId,
      })),
  );
  const comparable = current.filter((meal) => previous.has(meal.key));
  if (comparable.length === 0) return {score: 0.8, changed: 0};
  const changed = comparable.filter((meal) => previous.get(meal.key) !== meal.mealId).length;
  const changeRate = changed / comparable.length;
  const target = 0.35;
  return {
    score: clamp01(1 - Math.abs(changeRate - target) / target),
    changed,
  };
}

export function scorePlan(input: BuildPlanInput, plan: PlanEntryOut[]): PlanQuality {
  const priorities = normalizePriorities(input.planningPriorities);
  const nutritionTargets = normalizeNutritionTargets(input.nutritionTargets);
  const cost = weeklyCostPence(plan, input.pool);
  const ingredientCounts = ingredientCountsForPlan(plan, input.pool, input.availableIngredients);
  const reusedIngredientGroups = [...ingredientCounts.values()].filter((count) => count > 1).length;
  const regen = regenerationChangeScore(plan, input.previousPlan);
  const mainMeals = mainMealSequence(plan);
  const quality = {
    coverageScore: coverageScore(plan, input.days),
    nutritionScore: nutritionScore(plan, input.pool, nutritionTargets),
    varietyScore: varietyScore(plan, priorities),
    budgetScore: budgetScore(plan, input.pool, input.weeklyBudgetPence),
    shoppingSimplicityScore: shoppingSimplicityScore(plan, input.pool, input.availableIngredients),
    ingredientReuseScore: ingredientReuseScore(plan, input.pool, input.availableIngredients),
    regenerationChangeScore: regen.score,
    weeklyCostPence: cost,
    uniqueIngredientCount: ingredientCounts.size,
    reusedIngredientGroups,
    changedFlexibleSlots: regen.changed,
    uniqueLunchDinnerCount: new Set(mainMeals.map((meal) => meal.mealId)).size,
    maxConsecutiveLunchDinnerRepeats: maxConsecutiveMainMealRepeats(plan),
    hardVarietyViolationCount: hardVarietyViolationCount(plan),
  };
  const score =
    quality.varietyScore * 0.30 +
    quality.coverageScore * 0.20 +
    quality.budgetScore * 0.16 +
    quality.shoppingSimplicityScore * 0.13 +
    quality.ingredientReuseScore * 0.12 +
    quality.regenerationChangeScore * 0.05 +
    quality.nutritionScore * 0.04;

  return {
    score: Number(score.toFixed(4)),
    coverageScore: Number(quality.coverageScore.toFixed(4)),
    nutritionScore: Number(quality.nutritionScore.toFixed(4)),
    varietyScore: Number(quality.varietyScore.toFixed(4)),
    budgetScore: Number(quality.budgetScore.toFixed(4)),
    shoppingSimplicityScore: Number(quality.shoppingSimplicityScore.toFixed(4)),
    ingredientReuseScore: Number(quality.ingredientReuseScore.toFixed(4)),
    regenerationChangeScore: Number(quality.regenerationChangeScore.toFixed(4)),
    weeklyCostPence: quality.weeklyCostPence,
    uniqueIngredientCount: quality.uniqueIngredientCount,
    reusedIngredientGroups: quality.reusedIngredientGroups,
    changedFlexibleSlots: quality.changedFlexibleSlots,
    uniqueLunchDinnerCount: quality.uniqueLunchDinnerCount,
    maxConsecutiveLunchDinnerRepeats: quality.maxConsecutiveLunchDinnerRepeats,
    hardVarietyViolationCount: quality.hardVarietyViolationCount,
  };
}

export function buildBestPlan(input: BuildPlanInput): BestPlanResult {
  const candidateCount = Math.max(1, Math.min(24, Math.round(input.candidateCount ?? 12)));
  let bestPlan = buildPlan(input);
  let bestQuality = scorePlan(input, bestPlan);
  const baseSeed = input.variantSeed ?? 0;
  const shouldPreferRegenerationChange = (input.previousPlan?.length ?? 0) > 0;

  for (let index = 1; index < candidateCount; index += 1) {
    const candidateSeed = baseSeed + index * 9973;
    const candidatePlan = buildPlan({...input, variantSeed: candidateSeed});
    const candidateQuality = scorePlan(input, candidatePlan);
    const materiallyChangesPlan =
      shouldPreferRegenerationChange &&
      candidateQuality.changedFlexibleSlots > bestQuality.changedFlexibleSlots &&
      candidateQuality.hardVarietyViolationCount === 0 &&
      candidateQuality.coverageScore >= bestQuality.coverageScore - 0.05 &&
      candidateQuality.score >= bestQuality.score - 0.08;
    if (
      materiallyChangesPlan ||
      candidateQuality.score > bestQuality.score ||
      (candidateQuality.score === bestQuality.score &&
        candidateQuality.changedFlexibleSlots > bestQuality.changedFlexibleSlots)
    ) {
      bestPlan = candidatePlan;
      bestQuality = candidateQuality;
    }
  }

  return {plan: bestPlan, quality: bestQuality};
}

function recordUse({
  meal,
  slot,
  dayIndex,
  weekIndex,
  lastUsed,
  mealUseCounts,
  slotUseCounts,
  weeklyMealUseCounts,
  spentByWeek,
  usedToday,
  weekIngredients,
  mainMealHistory,
  countCost = true,
  recordIngredients = true,
}: {
  meal: AllocatorMeal;
  slot: MealSlot;
  dayIndex: number;
  weekIndex: number;
  lastUsed: Map<string, number>;
  mealUseCounts: Map<string, number>;
  slotUseCounts: Map<string, number>;
  weeklyMealUseCounts: Map<string, number>;
  spentByWeek: Map<number, number>;
  usedToday: Set<string>;
  weekIngredients?: Map<string, number>;
  mainMealHistory?: string[];
  countCost?: boolean;
  recordIngredients?: boolean;
}): void {
  const slotKey = `${slot}:${meal.id}`;
  lastUsed.set(slotKey, dayIndex);
  lastUsed.set(`any:${meal.id}`, dayIndex);
  mealUseCounts.set(meal.id, (mealUseCounts.get(meal.id) ?? 0) + 1);
  slotUseCounts.set(slotKey, (slotUseCounts.get(slotKey) ?? 0) + 1);
  if (slot !== "breakfast") {
    const weeklyKey = weeklyMealUseKey(weekIndex, meal.id);
    weeklyMealUseCounts.set(weeklyKey, (weeklyMealUseCounts.get(weeklyKey) ?? 0) + 1);
  }
  if (countCost) {
    spentByWeek.set(weekIndex, (spentByWeek.get(weekIndex) ?? 0) + mealCostPence(meal));
  }
  if (recordIngredients && weekIngredients) {
    recordWeekIngredients(meal, weekIngredients);
  }
  if (slot !== "breakfast" && mainMealHistory) {
    mainMealHistory.push(meal.id);
  }
  usedToday.add(meal.id);
}

function rankCandidates(
  pool: AllocatorMeal[],
  {
    b,
    slot,
    priorities,
    weekIngredients,
    preferred,
    disliked,
    lastUsed,
    mealUseCounts,
    slotUseCounts,
    dayIndex,
    variantSeed,
    hasPacedOptions,
  }: {
    b: Band;
    slot: MealSlot;
    priorities: PlanningPriorities;
    weekIngredients: Map<string, number>;
    preferred: Set<string>;
    disliked: Set<string>;
    lastUsed: Map<string, number>;
    mealUseCounts: Map<string, number>;
    slotUseCounts: Map<string, number>;
    dayIndex: number;
    variantSeed: number | undefined;
    hasPacedOptions: boolean;
  },
): AllocatorMeal[] {
  return [...pool].sort((a, c) => {
    if (!hasPacedOptions) {
      const byPrice = mealCostPence(a) - mealCostPence(c);
      if (byPrice !== 0) return byPrice;
    }

    if (b !== "low") {
      const byEffort =
        effortRank(classifyEffort(a), b, slot, priorities) -
        effortRank(classifyEffort(c), b, slot, priorities);
      if (byEffort !== 0) return byEffort;
    }

    const byIngredientReuse =
      ingredientReuseRank(c, weekIngredients, priorities) - ingredientReuseRank(a, weekIngredients, priorities);
    if (byIngredientReuse !== 0) return byIngredientReuse;

    const byDislike = mealDislikePenalty(a, disliked) - mealDislikePenalty(c, disliked);
    if (byDislike !== 0) return byDislike;

    const byLike = mealLikeBoost(c, preferred) - mealLikeBoost(a, preferred);
    if (byLike !== 0) return byLike;

    if (b === "low" && slot !== "breakfast" && priorities.mealRepeats !== "low-effort") {
      const aSlotUses = slotUseCounts.get(`${slot}:${a.id}`) ?? 0;
      const cSlotUses = slotUseCounts.get(`${slot}:${c.id}`) ?? 0;
      if (aSlotUses !== cSlotUses) return aSlotUses - cSlotUses;

      const aUses = mealUseCounts.get(a.id) ?? 0;
      const cUses = mealUseCounts.get(c.id) ?? 0;
      if (aUses !== cUses) return aUses - cUses;
    }

    if (b === "low") {
      const byEffort =
        effortRank(classifyEffort(a), b, slot, priorities) -
        effortRank(classifyEffort(c), b, slot, priorities);
      if (byEffort !== 0) return byEffort;
    }

    const aRecent = recentRepeatPenalty(a, priorities, slot, dayIndex, lastUsed);
    const cRecent = recentRepeatPenalty(c, priorities, slot, dayIndex, lastUsed);
    if (aRecent !== cRecent) return aRecent - cRecent;

    // Rotate similarly suitable meals before falling back to cost/prep tie-breaks.
    if (priorities.mealRepeats !== "low-effort") {
      const aSlotUses = slotUseCounts.get(`${slot}:${a.id}`) ?? 0;
      const cSlotUses = slotUseCounts.get(`${slot}:${c.id}`) ?? 0;
      if (aSlotUses !== cSlotUses) return aSlotUses - cSlotUses;

      const aUses = mealUseCounts.get(a.id) ?? 0;
      const cUses = mealUseCounts.get(c.id) ?? 0;
      if (aUses !== cUses) return aUses - cUses;
    }

    const aLastSlot = lastUsed.get(`${slot}:${a.id}`) ?? -99;
    const cLastSlot = lastUsed.get(`${slot}:${c.id}`) ?? -99;
    if (aLastSlot !== cLastSlot) return aLastSlot - cLastSlot;

    const aLastAny = lastUsed.get(`any:${a.id}`) ?? -99;
    const cLastAny = lastUsed.get(`any:${c.id}`) ?? -99;
    if (aLastAny !== cLastAny) return aLastAny - cLastAny;

    const byVariant =
      variantRank(a, slot, dayIndex, variantSeed) -
      variantRank(c, slot, dayIndex, variantSeed);
    if (byVariant !== 0) return byVariant;

    const byPrice = mealCostPence(a) - mealCostPence(c);
    if (byPrice !== 0) return byPrice;
    return a.time - c.time;
  });
}

function pickForSlot(
  candidates: AllocatorMeal[],
  b: Band,
  slot: MealSlot,
  maxPrep: number,
  remainingBudgetPence: number,
  pacedBudgetPence: number,
  lastUsed: Map<string, number>,
  mealUseCounts: Map<string, number>,
  slotUseCounts: Map<string, number>,
  weeklyMealUseCounts: Map<string, number>,
  weekIndex: number,
  weekIngredients: Map<string, number>,
  priorities: PlanningPriorities,
  preferred: Set<string>,
  disliked: Set<string>,
  usedToday: Set<string>,
  dayIndex: number,
  variantSeed: number | undefined,
  mainMealHistory: string[],
): AllocatorMeal | null {
  if (candidates.length === 0) return null;

  const withinPrep = candidates.filter((m) => m.time <= maxPrep);
  // Relax the prep cap only if nothing fits — prefer the lightest options then.
  const prepPool = withinPrep.length > 0 ? withinPrep : candidates;
  const affordable = prepPool.filter((m) => mealCostPence(m) <= remainingBudgetPence);
  const paced = affordable.filter((m) => mealCostPence(m) <= pacedBudgetPence);
  const poolAttempts = [
    {pool: paced, hasPacedOptions: true},
    {pool: affordable, hasPacedOptions: false},
    {pool: prepPool, hasPacedOptions: false},
    {pool: candidates, hasPacedOptions: false},
  ];

  for (const attempt of poolAttempts) {
    if (attempt.pool.length === 0) continue;
    const hardVarietyPool = attempt.pool.filter((m) =>
      !wouldCreateMainMealRepeat(m, slot, mainMealHistory) &&
      !wouldExceedWeeklyNonBreakfastLimit(m, slot, weekIndex, weeklyMealUseCounts),
    );
    if (hardVarietyPool.length === 0) continue;
    const notUsedToday = hardVarietyPool.filter((m) => !usedToday.has(m.id));
    const rotationPool = notUsedToday.length > 0 ? notUsedToday : hardVarietyPool;
    const ranked = rankCandidates(rotationPool, {
      b,
      slot,
      priorities,
      weekIngredients,
      preferred,
      disliked,
      lastUsed,
      mealUseCounts,
      slotUseCounts,
      dayIndex,
      variantSeed,
      hasPacedOptions: attempt.hasPacedOptions,
    });
    if (ranked[0]) return ranked[0];
  }

  return null;
}

function pickRoutineBreakfast(
  candidates: AllocatorMeal[],
  priorities: PlanningPriorities,
  slot: MealSlot,
  maxPrep: number,
  remainingBudgetPence: number,
  pacedBudgetPence: number,
  breakfastRoutineIds: string[],
  dayIndex: number,
): AllocatorMeal | null {
  if (slot !== "breakfast" || priorities.breakfastRoutine === "varied") return null;
  const routineIndex = priorities.breakfastRoutine === "repeat" ?
    Math.floor(dayIndex / 5) :
    dayIndex % 2;
  const routineId = breakfastRoutineIds[routineIndex];
  if (!routineId) return null;
  const picked = candidates.find((meal) => meal.id === routineId);
  if (!picked) return null;
  if (
    picked.time > maxPrep ||
    mealCostPence(picked) > remainingBudgetPence ||
    mealCostPence(picked) > pacedBudgetPence
  ) return null;
  return picked;
}

function recentRepeatPenalty(
  meal: AllocatorMeal,
  priorities: PlanningPriorities,
  slot: MealSlot,
  dayIndex: number,
  lastUsed: Map<string, number>,
): number {
  if (slot === "breakfast" && priorities.breakfastRoutine !== "varied") return 0;
  if (priorities.mealRepeats === "low-effort" && ["minimal", "batch"].includes(classifyEffort(meal))) return 0;
  const recent = dayIndex - (lastUsed.get(`any:${meal.id}`) ?? -99) <= RECENT_REPEAT_DAYS;
  if (!recent) return 0;
  return priorities.mealRepeats === "varied" ? 2 : 1;
}
