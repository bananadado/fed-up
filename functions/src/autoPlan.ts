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

/** Subset of the app `Meal` the allocator needs. */
export interface AllocatorMeal {
  id: string;
  type: MealType;
  mealSlots: MealSlot[];
  time: number;
  pricePence: number;
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
}

type Effort = "minimal" | "batch" | "cook";
type Band = "high" | "medium" | "low";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];
const LEFTOVER_PORTIONS = 2;
const LEFTOVER_SHELF_DAYS = 3;
const RECENT_REPEAT_DAYS = 3;

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

function canonicalTag(value: string): string {
  const tag = value.trim().toLowerCase().replace(/\s+/g, " ");
  return TAG_ALIASES[tag] ?? tag;
}

function canonicalTags(values: string[]): string[] {
  return [...new Set(values.map(canonicalTag).filter(Boolean))];
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
function effortRank(effort: Effort, b: Band, slot: MealSlot): number {
  if (b === "high") {
    // Crunch day: minimal prep first, never a from-scratch cook.
    return effort === "minimal" ? 0 : effort === "batch" ? 2 : 3;
  }
  if (b === "low" && slot !== "breakfast") {
    // Relaxed evening: prefer a batch cook so it seeds leftovers.
    return effort === "batch" ? 0 : effort === "cook" ? 1 : 2;
  }
  // Medium / breakfast: anything that fits, mild preference for lighter prep.
  return effort === "minimal" ? 0 : effort === "batch" ? 1 : 2;
}

export function buildPlan(input: BuildPlanInput): PlanEntryOut[] {
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
  const entries: PlanEntryOut[] = [];

  input.days.forEach((day, dayIndex) => {
    const b = band(day.stress);
    const maxPrep = day.recommended_constraints?.max_prep_minutes ?? 60;
    const meals: PlanMealOut[] = [];
    const usedToday = new Set<string>();
    const weekIndex = Math.floor(dayIndex / 7);

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
            mealCostPence(l.meal) <= remainingBudgetPence &&
            mealCostPence(l.meal) <= pacedBudgetPence &&
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
          });
          continue;
        }
      }

      const candidates = safePool.filter((m) => m.mealSlots.includes(slot));
      const picked = pickForSlot(
        candidates,
        b,
        slot,
        maxPrep,
        remainingBudgetPence,
        pacedBudgetPence,
        lastUsed,
        mealUseCounts,
        slotUseCounts,
        usedToday,
        dayIndex,
      );

      if (!picked) continue; // pool has nothing for this slot — leave it unfilled

      const effort = classifyEffort(picked);
      const isBatch = effort === "batch" && b === "low" && slot !== "breakfast";
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
      });

      if (isBatch) {
        for (let p = 0; p < LEFTOVER_PORTIONS; p += 1) {
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
}): void {
  const slotKey = `${slot}:${meal.id}`;
  lastUsed.set(slotKey, dayIndex);
  lastUsed.set(`any:${meal.id}`, dayIndex);
  mealUseCounts.set(meal.id, (mealUseCounts.get(meal.id) ?? 0) + 1);
  slotUseCounts.set(slotKey, (slotUseCounts.get(slotKey) ?? 0) + 1);
  spentByWeek.set(weekIndex, (spentByWeek.get(weekIndex) ?? 0) + mealCostPence(meal));
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
  usedToday: Set<string>,
  dayIndex: number,
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

    const aRecent = dayIndex - (lastUsed.get(`any:${a.id}`) ?? -99) <= RECENT_REPEAT_DAYS ? 1 : 0;
    const cRecent = dayIndex - (lastUsed.get(`any:${c.id}`) ?? -99) <= RECENT_REPEAT_DAYS ? 1 : 0;
    if (aRecent !== cRecent) return aRecent - cRecent;

    if (b === "low" && slot !== "breakfast") {
      const aSlotUses = slotUseCounts.get(`${slot}:${a.id}`) ?? 0;
      const cSlotUses = slotUseCounts.get(`${slot}:${c.id}`) ?? 0;
      if (aSlotUses !== cSlotUses) return aSlotUses - cSlotUses;

      const aUses = mealUseCounts.get(a.id) ?? 0;
      const cUses = mealUseCounts.get(c.id) ?? 0;
      if (aUses !== cUses) return aUses - cUses;
    }

    const byEffort = effortRank(classifyEffort(a), b, slot) - effortRank(classifyEffort(c), b, slot);
    if (byEffort !== 0) return byEffort;

    // Rotate similarly suitable meals before falling back to cost/prep tie-breaks.
    const aSlotUses = slotUseCounts.get(`${slot}:${a.id}`) ?? 0;
    const cSlotUses = slotUseCounts.get(`${slot}:${c.id}`) ?? 0;
    if (aSlotUses !== cSlotUses) return aSlotUses - cSlotUses;

    const aUses = mealUseCounts.get(a.id) ?? 0;
    const cUses = mealUseCounts.get(c.id) ?? 0;
    if (aUses !== cUses) return aUses - cUses;

    const aLastSlot = lastUsed.get(`${slot}:${a.id}`) ?? -99;
    const cLastSlot = lastUsed.get(`${slot}:${c.id}`) ?? -99;
    if (aLastSlot !== cLastSlot) return aLastSlot - cLastSlot;

    const aLastAny = lastUsed.get(`any:${a.id}`) ?? -99;
    const cLastAny = lastUsed.get(`any:${c.id}`) ?? -99;
    if (aLastAny !== cLastAny) return aLastAny - cLastAny;

    const byPrice = mealCostPence(a) - mealCostPence(c);
    if (byPrice !== 0) return byPrice;
    return a.time - c.time;
  });

  return ranked[0] ?? null;
}
