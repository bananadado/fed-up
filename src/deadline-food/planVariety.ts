import type { Meal, MealSlot, PlanEntry, Preferences } from "./types";

type RepairPlanVarietyInput = {
  plan: PlanEntry[];
  backendMeals: Meal[];
  savedRecipes: Meal[];
  catalogueMeals: Meal[];
  prefs: Preferences;
  variantSeed?: number;
};

type RepairPlanVarietyResult = {
  plan: PlanEntry[];
  meals: Meal[];
  changed: boolean;
};

const MAIN_SLOTS: MealSlot[] = ["lunch", "dinner"];
const MAX_NON_BREAKFAST_MEAL_USES_PER_WEEK = 3;

const TAG_ALIASES: Record<string, string> = {
  eggs: "egg",
  peanuts: "peanut",
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

function hasTag(meal: Meal, tag: string): boolean {
  return canonicalTags(meal.tags).includes(tag);
}

function hasAnyAllergen(meal: Meal, allergens: Set<string>): boolean {
  return canonicalTags(meal.allergens).some((allergen) => allergens.has(allergen));
}

function hasAnyIngredient(meal: Meal, patterns: string[]): boolean {
  return meal.ingredients.some((ingredient) => includesAnyPattern(ingredient.name || "", patterns));
}

function isAllergenSafe(meal: Meal, allergens: Set<string>): boolean {
  if (allergens.size === 0) return true;
  if (meal.allergens.some((allergen) => allergens.has(canonicalTag(allergen)))) return false;
  return !meal.ingredients.some((ingredient) => allergens.has(canonicalTag(ingredient.name || "")));
}

function isDietCompatible(meal: Meal, dietary: Set<string>): boolean {
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

function mealAllowed(meal: Meal, prefs: Preferences): boolean {
  return isAllergenSafe(meal, new Set(canonicalTags(prefs.allergens))) &&
    isDietCompatible(meal, new Set(canonicalTags(prefs.dietary)));
}

function dedupeMeals(meals: Meal[]): Meal[] {
  const byId = new Map<string, Meal>();
  for (const meal of meals) {
    if (meal?.id && !byId.has(meal.id)) byId.set(meal.id, meal);
  }
  return [...byId.values()];
}

function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickDeterministicRandom(candidates: Meal[], seed: string): Meal | null {
  if (candidates.length === 0) return null;
  return candidates[hash(seed) % candidates.length] ?? candidates[0] ?? null;
}

function wouldCreateThirdMainMealRepeat(mealId: string, mainMealHistory: string[]): boolean {
  const last = mainMealHistory[mainMealHistory.length - 1];
  const previous = mainMealHistory[mainMealHistory.length - 2];
  return last === mealId && previous === mealId;
}

function weeklyMealUseKey(weekIndex: number, mealId: string): string {
  return `${weekIndex}:${mealId}`;
}

function wouldExceedWeeklyMainMealLimit(mealId: string, weekIndex: number, weeklyMealUseCounts: Map<string, number>): boolean {
  return (weeklyMealUseCounts.get(weeklyMealUseKey(weekIndex, mealId)) ?? 0) >= MAX_NON_BREAKFAST_MEAL_USES_PER_WEEK;
}

function shouldRepairMainMeal(
  meal: Meal | undefined,
  mealId: string,
  mainMealHistory: string[],
  sameDayMainMealId: string | null,
  weekIndex: number,
  weeklyMealUseCounts: Map<string, number>,
  prefs: Preferences,
): boolean {
  if (!meal || !mealAllowed(meal, prefs)) return true;
  if (wouldExceedWeeklyMainMealLimit(mealId, weekIndex, weeklyMealUseCounts)) return true;
  if (wouldCreateThirdMainMealRepeat(mealId, mainMealHistory)) return true;
  return sameDayMainMealId === mealId;
}

export function repairPlanVariety({
  plan,
  backendMeals,
  savedRecipes,
  catalogueMeals,
  prefs,
  variantSeed = 0,
}: RepairPlanVarietyInput): RepairPlanVarietyResult {
  const pool = dedupeMeals([...backendMeals, ...savedRecipes, ...catalogueMeals])
    .filter((meal) => mealAllowed(meal, prefs));
  const byId = new Map(pool.map((meal) => [meal.id, meal]));
  const usedMeals = new Map(backendMeals.map((meal) => [meal.id, meal]));
  const mainMealHistory: string[] = [];
  const weeklyMealUseCounts = new Map<string, number>();
  let changed = false;

  const repairedPlan = plan.map((entry, dayIndex) => {
    let sameDayMainMealId: string | null = null;
    const weekIndex = Math.floor(dayIndex / 7);
    const meals = entry.meals.flatMap((planMeal, mealIndex) => {
      if (!MAIN_SLOTS.includes(planMeal.slot)) return [planMeal];

      const currentMeal = byId.get(planMeal.mealId);
      let mealId = planMeal.mealId;
      const needsRepair = shouldRepairMainMeal(
        currentMeal,
        mealId,
        mainMealHistory,
        sameDayMainMealId,
        weekIndex,
        weeklyMealUseCounts,
        prefs,
      );

      if (needsRepair) {
        const candidates = pool.filter((meal) =>
          meal.mealSlots.includes(planMeal.slot) &&
          meal.id !== mealId &&
          meal.id !== sameDayMainMealId &&
          !wouldCreateThirdMainMealRepeat(meal.id, mainMealHistory) &&
          !wouldExceedWeeklyMainMealLimit(meal.id, weekIndex, weeklyMealUseCounts),
        );
        const replacement = pickDeterministicRandom(
          candidates,
          `${variantSeed}:${entry.dateIso ?? entry.day}:${planMeal.slot}:${dayIndex}:${mealIndex}:${mainMealHistory.join("|")}`,
        );
        if (!replacement) {
          changed = true;
          return [];
        }
        mealId = replacement.id;
        usedMeals.set(replacement.id, replacement);
        changed = true;
      } else if (currentMeal) {
        usedMeals.set(currentMeal.id, currentMeal);
        mainMealHistory.push(mealId);
        weeklyMealUseCounts.set(
          weeklyMealUseKey(weekIndex, mealId),
          (weeklyMealUseCounts.get(weeklyMealUseKey(weekIndex, mealId)) ?? 0) + 1,
        );
        sameDayMainMealId = mealId;
        return [planMeal];
      }

      mainMealHistory.push(mealId);
      weeklyMealUseCounts.set(
        weeklyMealUseKey(weekIndex, mealId),
        (weeklyMealUseCounts.get(weeklyMealUseKey(weekIndex, mealId)) ?? 0) + 1,
      );
      sameDayMainMealId = mealId;
      return [{
        slot: planMeal.slot,
        mealId,
        ...(planMeal.rescued ? { rescued: planMeal.rescued } : {}),
      }];
    });

    return { ...entry, meals };
  });

  return {
    plan: repairedPlan,
    meals: [...usedMeals.values()],
    changed,
  };
}
