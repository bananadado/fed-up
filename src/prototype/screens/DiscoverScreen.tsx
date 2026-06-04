import { Clock3, LoaderCircle, Sparkles, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";

import { Card } from "@/components/ui/card";
import type { Deadline, DiscoverRecommendationState, Meal, Preferences } from "../types";
import { AppButton, Badge } from "../components/primitives";
import { formatCookingLimit, money, ingredientNames, sourceUrl } from "../utils";
import { mealHealthSignals } from "../healthSignals";
import type { TrackPrototypeEvent } from "../analytics";
import { fetchRecommenderRecommendations, recordRecommenderInteraction } from "../recommenderApi";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const RECOMMENDATION_BATCH_SIZE = 5;

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
  onSelectMeal,
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
  onSelectMeal: (mealId: string) => void;
  track: TrackPrototypeEvent;
}) {
  const latestRecommendationRequestId = useRef(0);
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
      ...reviewedRecipeIds,
      ...saved.map((meal) => meal.id),
      ...rejected.map((meal) => meal.id),
    ])],
    [reviewedRecipeIds, saved, rejected],
  );
  const reviewedRecipeIdSet = useMemo(() => new Set(excludedRecipeIds), [excludedRecipeIds]);
  const candidateRecipes = recommendedRecipes.filter((meal) => !customRecipes.some((customMeal) => customMeal.id === meal.id));

  const sortedQueue = candidateRecipes
    .filter((meal) => !reviewedRecipeIdSet.has(meal.id))
    .sort((a, b) => Number(b.tags.includes("high protein")) - Number(a.tags.includes("high protein")) || a.time - b.time);
  const current = sortedQueue[0];
  const shouldLoadRecommendationBatch =
    recommendationStatus === "idle" ||
    (recommendationStatus === "ready" && sortedQueue.length === 0);
  const recommendationExcludeIds = useMemo(
    () => [...new Set([
      ...excludedRecipeIds,
      ...recommendedRecipes.map((meal) => meal.id),
      ...customRecipes.map((meal) => meal.id),
    ])],
    [customRecipes, excludedRecipeIds, recommendedRecipes],
  );

  useEffect(() => {
    if (!shouldLoadRecommendationBatch) return;

    let cancelled = false;
    const requestId = latestRecommendationRequestId.current + 1;
    latestRecommendationRequestId.current = requestId;
    const controller = new AbortController();
    const excludedAtRequest = new Set(recommendationExcludeIds);
    fetchRecommenderRecommendations({
      sessionId,
      prefs,
      deadlines,
      excludeIds: recommendationExcludeIds,
      count: RECOMMENDATION_BATCH_SIZE,
      signal: controller.signal,
    })
      .then((recipes) => {
        if (!cancelled && latestRecommendationRequestId.current === requestId) {
          const usableRecipes = recipes.filter((recipe) => !excludedAtRequest.has(recipe.id));
          setRecommendationState({
            contextKey: recommendationContextKey,
            recipes: usableRecipes,
            status: usableRecipes.length > 0 ? "ready" : "exhausted",
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;

        if (!cancelled && latestRecommendationRequestId.current === requestId) {
          console.warn("Remote recommendations could not be loaded.", error);
          setRecommendationState({
            contextKey: recommendationContextKey,
            recipes: [],
            status: "exhausted",
          });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deadlines, prefs, recommendationContextKey, recommendationExcludeIds, sessionId, setRecommendationState, shouldLoadRecommendationBatch]);

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

  const showRecommendationLoading = sortedQueue.length === 0 && shouldLoadRecommendationBatch;

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-3xl font-bold">Discover recipes</h1>
        <p className="mt-2 text-stone-600">
          Save or pass on each option. Every suggestion respects your {formatCookingLimit(prefs.maxTime).toLowerCase()} cooking limit or is a nearby campus fallback.
        </p>
      </div>
      <div className="mx-auto max-w-[480px]">
        <div>
          {showRecommendationLoading ? (
            <Card className="gap-0 rounded-lg border-stone-200 bg-white p-10 text-center">
              <LoaderCircle className="mx-auto animate-spin text-emerald-700" />
              <p className="mt-4 font-semibold">Finding recipe ideas...</p>
            </Card>
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
                  <p className="mt-1 text-sm text-stone-700">{ingredientNames(current.ingredients, 5)}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
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
