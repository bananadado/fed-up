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
}

type Effort = "minimal" | "batch" | "cook";
type Band = "high" | "medium" | "low";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];
const LEFTOVER_PORTIONS = 2;
const LEFTOVER_SHELF_DAYS = 3;

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
  if (meal.ingredients.some((i) => avoided.has((i.name || "").toLowerCase()))) return false;
  if (meal.allergens.some((a) => avoided.has(a.toLowerCase()))) return false;
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
  const avoided = new Set(input.avoided.map((v) => v.toLowerCase()));
  const safePool = input.pool.filter((m) => isSafe(m, avoided));

  const leftovers: Leftover[] = [];
  // Last day index a meal was used in a given slot, to avoid back-to-back repeats.
  const lastUsed = new Map<string, number>(); // `${slot}:${mealId}` -> dayIndex
  const entries: PlanEntryOut[] = [];

  input.days.forEach((day, dayIndex) => {
    const b = band(day.stress);
    const maxPrep = day.recommended_constraints?.max_prep_minutes ?? 60;
    const meals: PlanMealOut[] = [];

    for (const slot of SLOTS) {
      // 1. On busy/moderate non-breakfast slots, spend a fresh leftover first.
      if (slot !== "breakfast" && b !== "low") {
        const idx = leftovers.findIndex(
          (l) => l.expiresDayIndex >= dayIndex && l.meal.mealSlots.includes(slot),
        );
        if (idx !== -1) {
          const [used] = leftovers.splice(idx, 1);
          meals.push({slot, mealId: used.meal.id, leftoverOf: used.meal.id});
          lastUsed.set(`${slot}:${used.meal.id}`, dayIndex);
          continue;
        }
      }

      const candidates = safePool.filter((m) => m.mealSlots.includes(slot));
      const picked = pickForSlot(candidates, b, slot, maxPrep, lastUsed, dayIndex);

      if (!picked) continue; // pool has nothing for this slot — leave it unfilled

      const effort = classifyEffort(picked);
      const isBatch = effort === "batch" && b === "low" && slot !== "breakfast";
      meals.push({slot, mealId: picked.id, ...(isBatch ? {batchCook: true} : {})});
      lastUsed.set(`${slot}:${picked.id}`, dayIndex);

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

function pickForSlot(
  candidates: AllocatorMeal[],
  b: Band,
  slot: MealSlot,
  maxPrep: number,
  lastUsed: Map<string, number>,
  dayIndex: number,
): AllocatorMeal | null {
  if (candidates.length === 0) return null;

  const withinPrep = candidates.filter((m) => m.time <= maxPrep);
  // Relax the prep cap only if nothing fits — prefer the lightest options then.
  const usable = withinPrep.length > 0 ? withinPrep : candidates;

  const ranked = [...usable].sort((a, c) => {
    const byEffort = effortRank(classifyEffort(a), b, slot) - effortRank(classifyEffort(c), b, slot);
    if (byEffort !== 0) return byEffort;
    // Then prefer meals not used in this slot yesterday, then shorter prep.
    const aRecent = (lastUsed.get(`${slot}:${a.id}`) ?? -99) === dayIndex - 1 ? 1 : 0;
    const cRecent = (lastUsed.get(`${slot}:${c.id}`) ?? -99) === dayIndex - 1 ? 1 : 0;
    if (aRecent !== cRecent) return aRecent - cRecent;
    return a.time - c.time;
  });

  return ranked[0] ?? null;
}
