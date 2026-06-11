import { BadgeCheck, Clock3, Sparkles, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Card } from "@/components/ui/card";
import type { Deadline, DiscoverRecommendationState, DiscoverRecommendationTrigger, Meal, MealSlot, Preferences } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { formatCookingLimit, isVerified, money, keyIngredients, sourceUrl } from "../utils";
import { mealHealthSignals } from "../healthSignals";
import type { TrackEvent } from "../analytics";
import { recordRecommenderInteraction } from "../recommenderApi";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const DISCOVER_REFILL_QUEUE_THRESHOLD = 2;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-stone-200 ${className}`} />;
}

function RecipeCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden rounded-lg border-stone-200 bg-white shadow-sm" aria-label="Loading recipe suggestions">
      <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-emerald-50 via-stone-100 to-amber-50">
        <div className="absolute inset-0 animate-pulse bg-white/30" />
        <div className="absolute bottom-4 left-4 right-4">
          <SkeletonBar className="h-3 w-28 bg-white/70" />
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <SkeletonBar className="h-5 w-4/5" />
            <SkeletonBar className="h-5 w-2/3" />
          </div>
          <SkeletonBar className="h-4 w-20" />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <SkeletonBar className="h-4 w-20" />
          <SkeletonBar className="h-4 w-14" />
        </div>
        <div className="mt-4 rounded-lg bg-stone-50 p-3">
          <SkeletonBar className="h-3 w-28" />
          <SkeletonBar className="mt-3 h-4 w-full" />
          <SkeletonBar className="mt-2 h-4 w-3/4" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBar className="h-6 w-20" />
          <SkeletonBar className="h-6 w-16" />
          <SkeletonBar className="h-6 w-24" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <SkeletonBar className="h-14 rounded-lg" />
          <SkeletonBar className="h-14 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

function StarRating({ rating, reviews }: { rating: number; reviews: number }) {
  if (rating === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={13} className={i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"} />
      ))}
      <span className="ml-0.5 text-sm font-medium text-stone-700">{rating.toFixed(1)}</span>
      {reviews > 0 && <span className="text-xs text-stone-400">({reviews})</span>}
    </span>
  );
}

export function DiscoverScreen({
  prefs,
  deadlines,
  sessionId,
  customRecipes,
  saved,
  setSaved,
  rejected,
  setRejected,
  reviewedRecipeIds,
  setReviewedRecipeIds,
  recommendationState,
  setRecommendationState,
  requestRecommendations,
  onSelectMeal,
  context,
  track,
}: {
  prefs: Preferences;
  deadlines: Deadline[];
  sessionId: string;
  customRecipes: Meal[];
  saved: Meal[];
  setSaved: StateSetter<Meal[]>;
  rejected: Meal[];
  setRejected: StateSetter<Meal[]>;
  reviewedRecipeIds: string[];
  setReviewedRecipeIds: StateSetter<string[]>;
  recommendationState: DiscoverRecommendationState;
  setRecommendationState: StateSetter<DiscoverRecommendationState>;
  requestRecommendations: (trigger: DiscoverRecommendationTrigger, contextOverride?: { day: string; slot: MealSlot; mealId: string } | null) => void;
  onSelectMeal: (mealId: string) => void;
  context?: { day: string; slot: MealSlot; mealId: string } | null;
  track: TrackEvent;
}) {
  // Verified-only by default so the community feed is opt-in and the recipe
  // list isn't diluted with unverified content (#213).
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const waitingForFirstCardRef = useRef(false);
  const firstCardMetricKeyRef = useRef("");
  const recommendationContextKey = useMemo(
    () => JSON.stringify({ deadlines, prefs, sessionId }),
    [deadlines, prefs, sessionId],
  );
  const recommendedRecipes = useMemo(
    () => recommendationState.contextKey === recommendationContextKey ? recommendationState.recipes : [],
    [recommendationContextKey, recommendationState],
  );
  const recommendationStatus = recommendationState.contextKey === recommendationContextKey ? recommendationState.status : "idle";
  const excludedRecipeIds = useMemo(
    () => [...new Set([
      ...(context?.mealId ? [context.mealId] : []),
      ...reviewedRecipeIds,
      ...saved.map((meal) => meal.id),
      ...rejected.map((meal) => meal.id),
    ])],
    [context, reviewedRecipeIds, saved, rejected],
  );
  const reviewedRecipeIdSet = useMemo(() => new Set(excludedRecipeIds), [excludedRecipeIds]);
  const candidateRecipes = recommendedRecipes
    .filter((meal) => !customRecipes.some((customMeal) => customMeal.id === meal.id))
    .filter((meal) => !context || meal.mealSlots.includes(context.slot))
    .filter((meal) => !verifiedOnly || isVerified(meal));

  const visibleQueue = candidateRecipes.filter((meal) => !reviewedRecipeIdSet.has(meal.id));
  const current = visibleQueue[0];
  const shouldLoadRecommendationBatch =
    recommendationStatus === "idle" ||
    (recommendationStatus === "ready" && visibleQueue.length <= DISCOVER_REFILL_QUEUE_THRESHOLD);

  useEffect(() => {
    if (!shouldLoadRecommendationBatch) return;

    requestRecommendations(recommendationStatus === "idle" ? "screen_mount" : "refill", context ?? null);
  }, [context, recommendationStatus, requestRecommendations, shouldLoadRecommendationBatch]);

  useEffect(() => {
    const waitingForRemoteCard = !current && (recommendationStatus === "idle" || recommendationStatus === "loading");
    if (waitingForRemoteCard) {
      waitingForFirstCardRef.current = true;
      return;
    }

    if (!current || !waitingForFirstCardRef.current) return;

    const metricKey = `${recommendationContextKey}:${recommendationState.requestStartedAt ?? "unknown"}`;
    if (firstCardMetricKeyRef.current === metricKey) return;

    firstCardMetricKeyRef.current = metricKey;
    waitingForFirstCardRef.current = false;
    track("discover_first_recipe_card_visible", {
      meal_id: current.id,
      queue_size: visibleQueue.length,
      request_trigger: recommendationState.requestTrigger,
      time_to_first_recipe_card_ms: recommendationState.requestStartedAt === undefined ? undefined : Math.round(nowMs() - recommendationState.requestStartedAt),
    });
  }, [
    current,
    recommendationContextKey,
    recommendationState.requestStartedAt,
    recommendationState.requestTrigger,
    recommendationStatus,
    track,
    visibleQueue.length,
  ]);

  function decideCurrentRecipe(like: boolean) {
    if (!current) return;

    track("discover_recipe_swiped", { meal_id: current.id, liked: like });
    recordRecommenderInteraction({
      sessionId,
      recipeId: current.id,
      action: like ? "swipe_right" : "swipe_left",
      deadlines,
    }).catch((error) => {
      console.warn("Recommender interaction could not be recorded.", error);
    });
    setReviewedRecipeIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));

    if (like) {
      setSaved((recipes) => (recipes.some((recipe) => recipe.id === current.id) ? recipes : [...recipes, current]));
    } else {
      setRejected((recipes) => [current, ...recipes.filter((recipe) => recipe.id !== current.id)].slice(0, 3));
    }
  }

  function restartReviewQueue() {
    const savedRecipeIds = new Set(saved.map((meal) => meal.id));
    setReviewedRecipeIds([]);
    setRejected([]);
    setRecommendationState({ contextKey: "", recipes: [], status: "idle" });
    track("discover_queue_restarted", { queue_size: candidateRecipes.filter((meal) => !savedRecipeIds.has(meal.id)).length });
  }

  const showRecommendationLoading =
    visibleQueue.length === 0 &&
    (recommendationStatus === "idle" || recommendationStatus === "loading" || shouldLoadRecommendationBatch);

  return (
    <div>
      {context && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Sparkles size={15} className="shrink-0" />
          <span>Finding alternatives for <strong>{context.day} {context.slot}</strong></span>
        </div>
      )}
      <div className="mb-7">
        <h1 className="text-3xl font-bold">Discover recipes</h1>
        <p className="mt-2 text-stone-600">
          Save or pass on each option. Every suggestion respects your {formatCookingLimit(prefs.maxTime).toLowerCase()} cooking limit or is a nearby campus fallback.
        </p>
        <div className="mt-4 flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1" role="group" aria-label="Recipe source filter">
          {([
            { value: true, label: "Verified only" },
            { value: false, label: "All recipes" },
          ] as const).map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => { setVerifiedOnly(option.value); track("discover_verified_filter_changed", { verified_only: option.value }); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${verifiedOnly === option.value ? "bg-emerald-50 text-emerald-800" : "text-stone-500 hover:text-stone-700"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[480px]">
        <div>
          {showRecommendationLoading ? (
            <RecipeCardSkeleton />
          ) : current ? (
            <Card className="gap-0 overflow-hidden rounded-lg border-stone-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => onSelectMeal(current.id)}
                className="h-48 w-full overflow-hidden transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                aria-label={`View details for ${current.name}`}
              >
                {current.photoUrl ? (
                  <img src={current.photoUrl} alt={current.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-emerald-50 text-7xl">
                    {current.image}
                  </div>
                )}
              </button>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectMeal(current.id)}
                    className="break-words text-left text-xl font-bold transition hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    {current.name}
                  </button>
                  <StarRating rating={current.rating} reviews={current.reviews.length} />
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <span className="flex items-center gap-1 text-sm font-semibold text-stone-700">
                    <Clock3 size={14} />{current.time} mins
                  </span>
                  <span className="text-sm font-semibold text-emerald-700">{money(current.price)}</span>
                </div>
                <p className="mt-1 text-sm text-stone-400">
                  {sourceUrl(current.source) ? (
                    <a
                      href={sourceUrl(current.source) as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-stone-600"
                      onClick={() => track("recipe_source_link_clicked", { meal_id: current.id })}
                    >
                      {current.source}
                    </a>
                  ) : (
                    current.source
                  )}
                </p>
                <div className="mt-4 rounded-lg bg-stone-50 p-3">
                  <p className="text-xs font-semibold uppercase text-stone-500">Key ingredients</p>
                  <p className="mt-1 text-sm text-stone-700">{keyIngredients(current.name, current.ingredients, 5)}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {isVerified(current) ? (
                    <Badge tone="blue"><BadgeCheck size={13} className="mr-1" /> Verified</Badge>
                  ) : (
                    <Badge tone="amber">Community</Badge>
                  )}
                  {current.mealSlots.map((slot) => (
                    <Badge key={`slot-${slot}`}>{slot.charAt(0).toUpperCase() + slot.slice(1)}</Badge>
                  ))}
                  {current.tags.map((tag) => (
                    <Badge key={`tag-${tag}`} tone="green">{tag}</Badge>
                  ))}
                  {mealHealthSignals(current).map((signal) => (
                    <Badge key={`health-${signal}`} tone="blue">{signal}</Badge>
                  ))}
                  {current.allergens.map((allergen) => (
                    <Badge key={`allergen-${allergen}`} tone="rose">{allergen}</Badge>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <AppButton type="button" variant="secondary" className="h-14 justify-center text-stone-600" onClick={() => decideCurrentRecipe(false)}>
                    <ThumbsDown size={18} /> Pass
                  </AppButton>
                  <AppButton type="button" className="h-14 justify-center" onClick={() => decideCurrentRecipe(true)}>
                    <ThumbsUp size={18} /> Save
                  </AppButton>
                </div>
                <AppButton variant="secondary" className="mt-3 w-full justify-center" onClick={() => onSelectMeal(current.id)}>
                  View recipe
                </AppButton>
              </div>
            </Card>
          ) : (
            <Card className="gap-0 rounded-lg border-stone-200 bg-white p-10 text-center">
              <Sparkles className="mx-auto text-emerald-700" />
              <p className="mt-4 font-semibold">You have reviewed today's suggestions.</p>
              <AppButton variant="secondary" className="mt-4" onClick={restartReviewQueue}>
                Restart
              </AppButton>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
