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
 * Allergens and dislikes are hard filters. No LLM, no randomness — fully
 * unit-testable and explainable.
 */

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type MealType = "cook" | "remix" | "fallback";

/** Subset of the prototype `Meal` the allocator needs. */
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
const DEFAULT_PRIORITIES: PlanningPriorities = {
  batchCooking: "balanced",
  breakfastRoutine: "repeat",
  mealRepeats: "balanced",
  ingredientReuse: "balanced",
  campusFallbacks: "when-busy",
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
const GLUTEN_INGREDIENT_PATTERNS = ["wheat", "barley", "rye", "flour", "bread", "pasta", "couscous"];
const DAIRY_INGREDIENT_PATTERNS = ["milk", "cheese", "butter", "yoghurt", "yogurt", "cream"];
const HALAL_INGREDIENT_PATTERNS = ["pork", "bacon", "ham", "lard", "gelatin", "wine", "beer", "alcohol"];
const ACADEMIC_EVENT_PATTERN =
  /\b(deadline|coursework|assignment|exam|quiz|test|submission|assessment|presentation|seminar|lecture|lab|tutorial|study|revision|review)\b/i;

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

function contextEventPressure(event: ContextEventInput): { stress: number; hardDeadline: boolean; maxPrep: number; freeEvening: boolean; durationHours: number } {
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
  return { stress, hardDeadline, maxPrep, freeEvening, durationHours };
}

export function localDaysFromContextEvents(events: ContextEventInput[], horizonDays: number): DayContext[] {
  const today = new Date();
  const dayCount = Math.max(1, Math.round(horizonDays));
  const days: DayContext[] = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(today, index).toISOString().slice(0, 10);
    return {
      date,
      stress: 0.3,
      free_evening: true,
      hard_deadlines: 0,
      recommended_constraints: { max_prep_minutes: 60 },
    };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));
  const loadByDate = new Map<string, { count: number; durationHours: number }>();

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
    const load = loadByDate.get(date) ?? { count: 0, durationHours: 0 };
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

export function mergeCalendarPressure(days: DayContext[], events: ContextEventInput[], horizonDays: number): DayContext[] {
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
    batchCooking: value?.batchCooking === "off" || value?.batchCooking === "high" ? value.batchCooking : DEFAULT_PRIORITIES.batchCooking,
    breakfastRoutine: value?.breakfastRoutine === "varied" || value?.breakfastRoutine === "rotate" ? value.breakfastRoutine : DEFAULT_PRIORITIES.breakfastRoutine,
    mealRepeats: value?.mealRepeats === "varied" || value?.mealRepeats === "low-effort" ? value.mealRepeats : DEFAULT_PRIORITIES.mealRepeats,
    ingredientReuse: value?.ingredientReuse === "low" || value?.ingredientReuse === "high" ? value.ingredientReuse : DEFAULT_PRIORITIES.ingredientReuse,
    campusFallbacks: value?.campusFallbacks === "off" || value?.campusFallbacks === "allowed" ? value.campusFallbacks : DEFAULT_PRIORITIES.campusFallbacks,
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

function ingredientKeys(meal: AllocatorMeal): string[] {
  return canonicalTags(meal.ingredients.map((ingredient) => ingredient.name || ""));
}

function ingredientOverlapScore(meal: AllocatorMeal, weekIngredients: Map<string, number>): number {
  if (weekIngredients.size === 0) return 0;
  return ingredientKeys(meal).reduce((score, key) => score + (weekIngredients.has(key) ? 1 : 0), 0);
}

function ingredientReuseRank(meal: AllocatorMeal, weekIngredients: Map<string, number>, priorities: PlanningPriorities): number {
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

function isBatchSlot(meal: AllocatorMeal, priorities: PlanningPriorities, b: Band, day: DayContext, slot: MealSlot): boolean {
  if (priorities.batchCooking === "off" || slot === "breakfast") return false;
  if (classifyEffort(meal) !== "batch") return false;
  if (b === "low") return true;
  return priorities.batchCooking === "high" && b === "medium" && day.free_evening;
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
  const spentByWeek = new Map<number, number>();
  const ingredientsByWeek = new Map<number, Map<string, number>>();
  const breakfastRoutineIds: string[] = [];
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
            !usedToday.has(l.meal.id),
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
            spentByWeek,
            usedToday,
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
        weekIngredients,
        priorities,
        usedToday,
        dayIndex,
        input.variantSeed,
      );

      if (!picked) continue; // pool has nothing for this slot — leave it unfilled

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
        spentByWeek,
        usedToday,
        weekIngredients,
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

function recordUse({
  meal,
  slot,
  dayIndex,
  weekIndex,
  lastUsed,
  mealUseCounts,
  slotUseCounts,
  spentByWeek,
  usedToday,
  weekIngredients,
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
  spentByWeek: Map<number, number>;
  usedToday: Set<string>;
  weekIngredients?: Map<string, number>;
  countCost?: boolean;
  recordIngredients?: boolean;
}): void {
  const slotKey = `${slot}:${meal.id}`;
  lastUsed.set(slotKey, dayIndex);
  lastUsed.set(`any:${meal.id}`, dayIndex);
  mealUseCounts.set(meal.id, (mealUseCounts.get(meal.id) ?? 0) + 1);
  slotUseCounts.set(slotKey, (slotUseCounts.get(slotKey) ?? 0) + 1);
  if (countCost) {
    spentByWeek.set(weekIndex, (spentByWeek.get(weekIndex) ?? 0) + mealCostPence(meal));
  }
  if (recordIngredients && weekIngredients) {
    recordWeekIngredients(meal, weekIngredients);
  }
  usedToday.add(meal.id);
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
  weekIngredients: Map<string, number>,
  priorities: PlanningPriorities,
  usedToday: Set<string>,
  dayIndex: number,
  variantSeed: number | undefined,
): AllocatorMeal | null {
  if (candidates.length === 0) return null;

  const withinPrep = candidates.filter((m) => m.time <= maxPrep);
  // Relax the prep cap only if nothing fits — prefer the lightest options then.
  const usable = withinPrep.length > 0 ? withinPrep : candidates;
  const affordable = usable.filter((m) => mealCostPence(m) <= remainingBudgetPence);
  if (affordable.length === 0) return null;

  const paced = affordable.filter((m) => mealCostPence(m) <= pacedBudgetPence);
  const budgetPool = paced.length > 0 ? paced : affordable;
  const notUsedToday = budgetPool.filter((m) => !usedToday.has(m.id));
  const rotationPool = notUsedToday.length > 0 ? notUsedToday : budgetPool;
  const hasPacedOptions = paced.length > 0;

  const ranked = [...rotationPool].sort((a, c) => {
    if (!hasPacedOptions) {
      const byPrice = mealCostPence(a) - mealCostPence(c);
      if (byPrice !== 0) return byPrice;
    }

    if (b !== "low") {
      const byEffort = effortRank(classifyEffort(a), b, slot, priorities) - effortRank(classifyEffort(c), b, slot, priorities);
      if (byEffort !== 0) return byEffort;
    }

    const byIngredientReuse =
      ingredientReuseRank(c, weekIngredients, priorities) - ingredientReuseRank(a, weekIngredients, priorities);
    if (byIngredientReuse !== 0) return byIngredientReuse;

    if (b === "low" && slot !== "breakfast" && priorities.mealRepeats !== "low-effort") {
      const aSlotUses = slotUseCounts.get(`${slot}:${a.id}`) ?? 0;
      const cSlotUses = slotUseCounts.get(`${slot}:${c.id}`) ?? 0;
      if (aSlotUses !== cSlotUses) return aSlotUses - cSlotUses;

      const aUses = mealUseCounts.get(a.id) ?? 0;
      const cUses = mealUseCounts.get(c.id) ?? 0;
      if (aUses !== cUses) return aUses - cUses;
    }

    if (b === "low") {
      const byEffort = effortRank(classifyEffort(a), b, slot, priorities) - effortRank(classifyEffort(c), b, slot, priorities);
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

    const byVariant = variantRank(a, slot, dayIndex, variantSeed) - variantRank(c, slot, dayIndex, variantSeed);
    if (byVariant !== 0) return byVariant;

    const byPrice = mealCostPence(a) - mealCostPence(c);
    if (byPrice !== 0) return byPrice;
    return a.time - c.time;
  });

  return ranked[0] ?? null;
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
  const routineIndex = priorities.breakfastRoutine === "repeat" ? Math.floor(dayIndex / 5) : dayIndex % 2;
  const routineId = breakfastRoutineIds[routineIndex];
  if (!routineId) return null;
  const picked = candidates.find((meal) => meal.id === routineId);
  if (!picked) return null;
  if (picked.time > maxPrep || mealCostPence(picked) > remainingBudgetPence || mealCostPence(picked) > pacedBudgetPence) return null;
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
