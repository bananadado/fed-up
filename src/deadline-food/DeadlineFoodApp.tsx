import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";

import { capturePostHogEvent, registerPostHogContext, registerPostHogSession, type AnalyticsProperties } from "@/lib/posthog";
import { initialPlan, initialPreferences } from "./data";
import type { CalendarEvent, CalendarProvider, Deadline, DiscoverRecommendationState, DiscoverRecommendationTrigger, Meal, MealSlot, PlanEntry, Preferences, Screen } from "./types";
import {
  clearStoredAnonymousSessionId,
  deleteAccountProfile,
  getOrCreateAnonymousSessionId,
  loadAnonymousSessionSettings,
  saveAnonymousSessionSettings,
} from "./anonymousSessionApi";
import {
  PRIVACY_POLICY_URL,
  createSessionSettings,
  hasCurrentPrivacyConsent,
  normalizePreferences,
  restoreSessionPlan,
  type CalendarToken,
  type IcsSubscription,
  type PrivacyConsent,
} from "./sessionPersistence";
import {
  fetchRecommenderRecommendations,
  fetchRecipeStates,
  fetchSharedRecipe,
  syncRecommenderUser,
  type RecipeState,
} from "./recommenderApi";
import { isVerified, mealById } from "./utils";
import { recipeShareToken, shareIdForRecipe } from "./recipeShare";
import { computePlanSignature, generateAutoPlan } from "./autoPlanApi";
import {
  completeDeadlineFoodEmailLinkSignIn,
  linkDeadlineFoodAccount,
  onDeadlineFoodAccountChanged,
  sendDeadlineFoodEmailMagicLink,
  signInExistingDeadlineFoodAccount,
  signOutDeadlineFoodAccount,
  switchToAnonymousAccountOnThisDevice,
  type AccountMessageTone,
  type EmailMagicLinkOptions,
  type AccountProviderId,
  type AccountSummary,
} from "./accountAuth";
import { fetchRecipeCatalogue, getRecipeCatalogue, registerPlanMeals, registerSessionMeals, setRecipeCatalogue } from "./recipeCatalogue";
import { Shell } from "./components/Shell";
import { CalendarScreen } from "./screens/CalendarScreen";
import { Dashboard } from "./screens/Dashboard";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";
import { PlanScreen } from "./screens/PlanScreen";
import { PrivacyPolicyScreen } from "./screens/PrivacyPolicyScreen";
import { RecipeDetailScreen } from "./screens/RecipeDetailScreen";
import { RecipesHubScreen } from "./screens/RecipesHubScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

const screens: Screen[] = ["landing", "onboarding", "privacy-policy", "dashboard", "calendar", "plan", "recipes", "settings", "recipe-detail"];
const onboardingScreens = new Set<Screen>(["landing", "onboarding"]);
const DISCOVER_RECOMMENDATION_BATCH_SIZE = 5;

type DiscoverRecommendationRequest = {
  contextKey: string;
  id: number;
};

function screenFromLocation(): Screen | null {
  if (typeof window === "undefined") return null;

  if (window.location.pathname.replace(/\/$/, "") === PRIVACY_POLICY_URL) {
    return "privacy-policy";
  }

  // Deep link to a single recipe by its public share slug (#213).
  if (recipeShareToken(window.location.hash)) {
    return "recipe-detail";
  }

  const value = window.location.hash.replace("#/", "") as Screen;
  return screens.includes(value) ? value : null;
}

function isAppScreen(screen: Screen): boolean {
  return !onboardingScreens.has(screen) && screen !== "privacy-policy";
}

function urlForScreen(screen: Screen): string {
  return screen === "privacy-policy" ? PRIVACY_POLICY_URL : `/#/${screen}`;
}

function replaceScreenUrl(screen: Screen): void {
  window.history.replaceState({ screen }, "", urlForScreen(screen));
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f5] px-5 text-stone-900">
      <div className="rounded-lg border border-stone-200 bg-white px-6 py-5 text-stone-700 shadow-sm">
        Loading your meal plan...
      </div>
    </main>
  );
}

function budgetBand(budget: number): string {
  if (budget < 20) return "under_20";
  if (budget < 35) return "20_to_34";
  if (budget < 50) return "35_to_49";
  return "50_plus";
}

function maxTimeBucket(maxTime: number | null): string {
  if (maxTime === null) return "unlimited";
  if (maxTime <= 15) return "15_or_less";
  if (maxTime <= 30) return "16_to_30";
  if (maxTime <= 60) return "31_to_60";
  return "over_60";
}

export function DeadlineFoodApp() {
  const posthog = usePostHog();
  const [sessionId, setSessionId] = useState(() => getOrCreateAnonymousSessionId());
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [canPersistSession, setCanPersistSession] = useState(false);
  const [account, setAccount] = useState<AccountSummary>({
    configured: false,
    uid: null,
    email: null,
    displayName: null,
    isAnonymous: true,
    providerIds: [],
  });
  const [accountMessage, setAccountMessage] = useState("");
  const [accountMessageTone, setAccountMessageTone] = useState<AccountMessageTone>("info");
  const [accountBusy, setAccountBusy] = useState<AccountProviderId | "email" | "anonymous" | "logout" | "delete" | null>(null);
  // Set an account-area notice with a tone so the UI styles errors distinctly
  // from success/info. Clear with notifyAccount("").
  const notifyAccount = useCallback((text: string, tone: AccountMessageTone = "info") => {
    setAccountMessage(text);
    setAccountMessageTone(tone);
  }, []);
  const [screen, setScreen] = useState<Screen>(() => screenFromLocation() ?? "landing");
  const routeHistory = useRef<Screen[]>([]);
  const pendingHashScreen = useRef<Screen | null>(null);
  const [previousScreen, setPreviousScreen] = useState<Screen | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [calendarProvider, setCalendarProvider] = useState<CalendarProvider>("google");
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [selectedSources, setSelectedSources] = useState(["budget", "bbc", "own", "campus"]);
  const [plan, setPlan] = useState<PlanEntry[]>(initialPlan);
  const [customRecipes, setCustomRecipes] = useState<Meal[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [discoverSaved, setDiscoverSaved] = useState<Meal[]>([]);
  const [discoverRejected, setDiscoverRejected] = useState<Meal[]>([]);
  const [discoverReviewedRecipeIds, setDiscoverReviewedRecipeIds] = useState<string[]>([]);
  const [discoverContext, setDiscoverContext] = useState<{ day: string; slot: MealSlot; mealId: string } | null>(null);
  const [discoverRecommendationState, setDiscoverRecommendationState] = useState<DiscoverRecommendationState>({
    contextKey: "",
    recipes: [],
    status: "idle",
  });
  const latestDiscoverRecommendationRequestId = useRef(0);
  const discoverRecommendationInFlightRef = useRef<DiscoverRecommendationRequest | null>(null);
  const discoverQueueInputsRef = useRef({
    customRecipes,
    discoverSaved,
    discoverRejected,
    discoverReviewedRecipeIds,
    discoverRecommendationState,
    discoverContext,
  });
  const [icsSubscriptions, setIcsSubscriptions] = useState<IcsSubscription[]>([]);
  const [calendarTokens, setCalendarTokens] = useState<CalendarToken[]>([]);
  const [privacyConsent, setPrivacyConsentState] = useState<PrivacyConsent | undefined>(undefined);
  const [selectedMealId, setSelectedMealId] = useState(initialPlan[0]?.meals[0]?.mealId ?? "m1");
  // A recipe fetched from a `#/recipe/<shareId>` deep link that the viewer does
  // not already have locally (e.g. a friend's shared community recipe) (#213).
  const [sharedRecipe, setSharedRecipe] = useState<Meal | null>(null);
  // Resolution state for a `#/recipe/<shareId>` deep link the viewer doesn't
  // have locally: "loading" while fetching, "unavailable" when it can't be
  // resolved (unpublished/deleted/broken link or backend error). Prevents the
  // detail screen from falling back to the default recipe (#213 follow-up).
  const [sharedRecipeStatus, setSharedRecipeStatus] = useState<"idle" | "loading" | "unavailable">(() => {
    // Cold-load on a deep link the viewer doesn't obviously have: start in
    // "loading" so the default recipe never flashes before the resolver runs.
    if (typeof window === "undefined") return "idle";
    const token = recipeShareToken(window.location.hash);
    return token && shareIdForRecipe(selectedMealId) !== token ? "loading" : "idle";
  });
  // Bumped on every hashchange/popstate so the deep-link resolver re-runs even
  // when navigating between two recipe URLs (the screen stays "recipe-detail").
  const [locationTick, setLocationTick] = useState(0);
  const [calendarSkipped, setCalendarSkipped] = useState(false);
  // Auto-planning (issue #66): the signature/timestamp the current plan was
  // generated from, so we can detect when it has gone stale.
  const [planSignature, setPlanSignature] = useState<string | undefined>(undefined);
  const [planGeneratedAt, setPlanGeneratedAt] = useState<string | undefined>(undefined);
  const [planGenerating, setPlanGenerating] = useState(false);
  const [planMeals, setPlanMeals] = useState<Meal[]>([]);
  // Bumped once the canonical recipe catalogue is hydrated from Firestore so
  // screens re-read it via mealById/getMealById (issue #123).
  const [catalogueVersion, setCatalogueVersion] = useState(0);
  const catalogueLoadedRef = useRef(false);
  const hasPrivacyConsent = hasCurrentPrivacyConsent(privacyConsent);
  const syncPreviousScreen = useCallback(() => {
    setPreviousScreen(routeHistory.current.at(-1) ?? null);
  }, []);

  const enableSessionPersistence = useCallback(() => {
    setCanPersistSession(true);
  }, []);

  const setPrivacyConsent = useCallback((consent: PrivacyConsent) => {
    enableSessionPersistence();
    setPrivacyConsentState(consent);
  }, [enableSessionPersistence]);

  const navigateScreen = useCallback((nextScreen: Screen, url?: string) => {
    if (screen === nextScreen) return;
    if (nextScreen !== "recipes") setDiscoverContext(null);
    enableSessionPersistence();
    routeHistory.current = [...routeHistory.current, screen].slice(-20);
    syncPreviousScreen();
    pendingHashScreen.current = nextScreen;
    window.history.pushState({ screen: nextScreen }, "", url ?? urlForScreen(nextScreen));
    setScreen(nextScreen);
  }, [enableSessionPersistence, screen, syncPreviousScreen]);

  useEffect(() => {
    discoverQueueInputsRef.current = {
      customRecipes,
      discoverSaved,
      discoverRejected,
      discoverReviewedRecipeIds,
      discoverRecommendationState,
      discoverContext,
    };
  }, [
    customRecipes,
    discoverContext,
    discoverRecommendationState,
    discoverRejected,
    discoverReviewedRecipeIds,
    discoverSaved,
  ]);

  useEffect(() => {
    if (!onboarded || !hasPrivacyConsent || catalogueLoadedRef.current) {
      return;
    }

    let cancelled = false;
    catalogueLoadedRef.current = true;

    fetchRecipeCatalogue()
      .then((recipes) => {
        if (!cancelled) {
          setRecipeCatalogue(recipes);
          setCatalogueVersion((version) => version + 1);
        }
      })
      .catch((error) => {
        catalogueLoadedRef.current = false;
        console.warn("Recipe catalogue could not be loaded; using bundled seeds.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [hasPrivacyConsent, onboarded]);

  const navigateBack = useCallback(() => {
    const fallbackScreen: Screen = "dashboard";
    let nextScreen = routeHistory.current.pop() ?? fallbackScreen;
    while (onboarded && (nextScreen === "onboarding" || nextScreen === "landing")) {
      nextScreen = routeHistory.current.pop() ?? fallbackScreen;
    }

    syncPreviousScreen();

    if (screen === nextScreen) {
      return;
    }

    pendingHashScreen.current = nextScreen;
    window.history.pushState({ screen: nextScreen }, "", urlForScreen(nextScreen));
    setScreen(nextScreen);
  }, [screen, syncPreviousScreen, onboarded]);

  const track = useCallback(
    (eventName: string, properties: AnalyticsProperties = {}) => {
      capturePostHogEvent(posthog, eventName, properties);
    },
    [posthog],
  );

  const requestDiscoverRecommendations = useCallback((
    trigger: DiscoverRecommendationTrigger,
    contextOverride: { day: string; slot: MealSlot; mealId: string } | null = discoverContext,
  ) => {
    const contextKey = JSON.stringify({ deadlines, prefs, sessionId });
    const currentInputs = discoverQueueInputsRef.current;
    const currentState = currentInputs.discoverRecommendationState;
    const existingRecipes = currentState.contextKey === contextKey ? currentState.recipes : [];

    if (discoverRecommendationInFlightRef.current?.contextKey === contextKey) {
      return;
    }

    const excludeIds = [...new Set([
      ...(contextOverride?.mealId ? [contextOverride.mealId] : []),
      ...currentInputs.discoverReviewedRecipeIds,
      ...currentInputs.discoverSaved.map((meal) => meal.id),
      ...currentInputs.discoverRejected.map((meal) => meal.id),
      ...existingRecipes.map((meal) => meal.id),
      ...currentInputs.customRecipes.map((meal) => meal.id),
    ])];
    const requestId = latestDiscoverRecommendationRequestId.current + 1;
    latestDiscoverRecommendationRequestId.current = requestId;
    discoverRecommendationInFlightRef.current = { contextKey, id: requestId };
    const requestStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    setDiscoverRecommendationState((previous) => ({
      contextKey,
      recipes: previous.contextKey === contextKey ? previous.recipes : [],
      status: "loading",
      requestStartedAt,
      requestTrigger: trigger,
    }));

    fetchRecommenderRecommendations({
      sessionId,
      prefs,
      deadlines,
      excludeIds,
      count: DISCOVER_RECOMMENDATION_BATCH_SIZE,
      onMetrics: (metrics) => {
        track("discover_recommendation_batch_profiled", {
          trigger,
          requested_count: DISCOVER_RECOMMENDATION_BATCH_SIZE,
          returned_count: metrics.recipeCount,
          total_ms: Math.round(metrics.totalMs),
          user_sync_ms: Math.round(metrics.userSyncMs),
          deadline_context_ms: Math.round(metrics.deadlineContextMs),
          recommendation_network_ms: Math.round(metrics.recommendationNetworkMs),
          server_total_ms: metrics.serverTotalMs === undefined ? undefined : Math.round(metrics.serverTotalMs),
          server_recommender_ms: metrics.serverUpstreamMs === undefined ? undefined : Math.round(metrics.serverUpstreamMs),
          server_hydration_ms: metrics.serverHydrationMs === undefined ? undefined : Math.round(metrics.serverHydrationMs),
        });
      },
    })
      .then((recipes) => {
        if (discoverRecommendationInFlightRef.current?.id !== requestId) return;

        setDiscoverRecommendationState((previous) => {
          const currentRecipes = previous.contextKey === contextKey ? previous.recipes : [];
          const latestInputs = discoverQueueInputsRef.current;
          const latestContext = latestInputs.discoverContext;
          const latestExcludedIds = [
            ...(latestContext?.mealId ? [latestContext.mealId] : []),
            ...latestInputs.discoverReviewedRecipeIds,
            ...latestInputs.discoverSaved.map((meal) => meal.id),
            ...latestInputs.discoverRejected.map((meal) => meal.id),
            ...latestInputs.customRecipes.map((meal) => meal.id),
          ];
          const knownIds = new Set([...excludeIds, ...latestExcludedIds, ...currentRecipes.map((meal) => meal.id)]);
          const newRecipes = recipes.filter((recipe) => !knownIds.has(recipe.id));
          return {
            contextKey,
            recipes: [...currentRecipes, ...newRecipes],
            status: newRecipes.length > 0 ? "ready" : "exhausted",
            requestStartedAt,
            requestTrigger: trigger,
          };
        });
        if (discoverRecommendationInFlightRef.current?.id === requestId) {
          discoverRecommendationInFlightRef.current = null;
        }
      })
      .catch((error) => {
        if (discoverRecommendationInFlightRef.current?.id !== requestId) return;

        console.warn("Remote recommendations could not be loaded.", error);
        track("discover_recommendation_batch_failed", { trigger });
        setDiscoverRecommendationState((previous) => ({
          contextKey,
          recipes: previous.contextKey === contextKey ? previous.recipes : [],
          status: "exhausted",
          requestStartedAt,
          requestTrigger: trigger,
        }));
        if (discoverRecommendationInFlightRef.current?.id === requestId) {
          discoverRecommendationInFlightRef.current = null;
        }
      });
  }, [
    deadlines,
    discoverContext,
    prefs,
    sessionId,
    track,
  ]);

  useEffect(() => {
    registerPostHogSession(posthog, sessionId);
  }, [posthog, sessionId]);

  // Read the latest sessionId from inside stable callbacks without re-subscribing.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  // True while the current sessionId's data is still being loaded into state.
  // The auto-save effect must not persist until this clears, otherwise switching
  // sessions (e.g. signing in and adopting the account's linked session) would
  // write the stale seed state over the account's saved data before its real
  // settings have loaded. A ref (not state) so the load effect can set it
  // synchronously before the save effect runs in the same commit.
  const sessionLoadPendingRef = useRef(true);
  // Share a single destination resolution between onAuthStateChanged and direct
  // sign-in completions. Firebase can complete email/OAuth before our listener
  // observes an anonymous->authenticated transition, so successful sign-in
  // handlers also call resolveSignInDestination explicitly.
  const signInResolutionPromiseRef = useRef<Promise<void> | null>(null);
  const suppressAuthStateDestinationRef = useRef(false);

  // Decide where a freshly signed-in user lands. The backend returns the
  // account's linked session when one exists; if that session is onboarded we
  // treat this as an existing account and go to the dashboard. Otherwise we keep
  // the user signed in and run onboarding under that account, so the next save
  // attaches the session without showing a separate account step.
  const resolveSignInDestination = useCallback((options: { existingAccount?: boolean } = {}) => {
    if (signInResolutionPromiseRef.current) return signInResolutionPromiseRef.current;

    const resolution = (async () => {
      const snapshot = await loadAnonymousSessionSettings(sessionIdRef.current);
      // Treat the sign-in as a returning user when Firebase reports the account
      // already existed (options.existingAccount) OR the backend already has an
      // onboarded plan for it. Either way we skip onboarding and load their
      // synced session straight onto the dashboard.
      const hasExistingPlan = options.existingAccount === true || snapshot.settings?.onboarded === true;
      if (hasExistingPlan) {
        // setSessionId re-runs the session-load effect, which repopulates all
        // state (prefs, plan, deadlines…) and sets onboarded from the settings.
        if (snapshot.sessionId !== sessionIdRef.current) {
          setSessionId(snapshot.sessionId);
        }
        setOnboarded(true);
        setCanPersistSession(true);
        notifyAccount("");
        window.location.hash = "/dashboard";
      } else {
        if (snapshot.sessionId !== sessionIdRef.current) {
          setSessionId(snapshot.sessionId);
        }
        setOnboarded(false);
        setCanPersistSession(true);
        notifyAccount("");
        window.location.hash = "/onboarding";
      }
    })().catch((error) => {
      const message = error instanceof Error ? error.message : "Sign-in could not be completed.";
      notifyAccount(message, "error");
      signInResolutionPromiseRef.current = null; // allow a retry after a failure
    });

    signInResolutionPromiseRef.current = resolution;
    return resolution;
  }, [notifyAccount]);

  const prevAccountRef = useRef<AccountSummary | null>(null);
  useEffect(() => {
    return onDeadlineFoodAccountChanged((nextAccount) => {
      const prev = prevAccountRef.current;
      prevAccountRef.current = nextAccount;
      setAccount(nextAccount);
      if (nextAccount.isAnonymous) {
        // Back to anonymous (manual sign-out, or the onboard-as-anonymous path):
        // allow the next sign-in to resolve a destination again.
        signInResolutionPromiseRef.current = null;
        return;
      }
      // Detect any anonymous→authenticated transition regardless of which sign-in
      // path completed it (popup, redirect, email link). A null prev means an
      // already-authenticated user being restored on load — handled by the
      // session-load effect, not here.
      if (prev !== null && prev.isAnonymous) {
        if (suppressAuthStateDestinationRef.current) {
          return;
        }
        void resolveSignInDestination();
      }
    });
  }, [resolveSignInDestination]);

  useEffect(() => {
    function onLocationChange() {
      setLocationTick((tick) => tick + 1);
      const nextScreen = screenFromLocation();
      if (nextScreen) {
        if (pendingHashScreen.current === nextScreen) {
          pendingHashScreen.current = null;
          setScreen(nextScreen);
          return;
        }

        setScreen(currentScreen => {
          if (currentScreen === nextScreen) {
            return currentScreen;
          }

          if (routeHistory.current.at(-1) === nextScreen) {
            routeHistory.current.pop();
          } else {
            routeHistory.current = [...routeHistory.current, currentScreen].slice(-20);
          }

          syncPreviousScreen();
          return nextScreen;
        });
      }
    }

    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, [syncPreviousScreen]);

  useEffect(() => {
    registerPostHogContext(posthog, {
      current_screen: screen,
      app_onboarded: onboarded,
      deadline_count: deadlines.length,
      custom_recipe_count: customRecipes.length,
      selected_source_count: selectedSources.length,
      budget_band: budgetBand(prefs.budget),
      kitchen_access: prefs.kitchen,
      cooking_ability: prefs.cookingAbility,
      max_time_bucket: maxTimeBucket(prefs.maxTime),
      dietary_count: prefs.dietary.length,
      allergen_count: prefs.allergens.length,
      dislike_count: prefs.dislikes.length,
      like_count: prefs.likes.length,
    });
  }, [customRecipes.length, deadlines.length, onboarded, posthog, prefs, screen, selectedSources.length]);

  useEffect(() => {
    track("app_screen_viewed", { screen });
  }, [screen, track]);

  useEffect(() => {
    let cancelled = false;
    // Block auto-saves for this sessionId until its data has loaded. Set
    // synchronously here so the save effect (declared later, runs after this one
    // in the same commit) observes it immediately on a sessionId change.
    sessionLoadPendingRef.current = true;

    loadAnonymousSessionSettings(sessionId)
      .then(snapshot => {
        if (cancelled) return;

        if (snapshot.sessionId !== sessionId) {
          setSessionId(snapshot.sessionId);
        }

        if (snapshot.settings !== null) {
          setPrefs(normalizePreferences(snapshot.settings.preferences));
          setDeadlines(snapshot.settings.deadlines.map((d): Deadline => ({
            ...d,
            eventType: d.eventType ?? "general",
            effortHours: d.effortHours ?? 3,
            urgency: d.urgency ?? "medium",
          })));
          setSelectedSources(snapshot.settings.selectedSources);
          // Never downgrade onboarded from true→false: an auth transition
          // (email link / OAuth redirect) may have already set it to true
          // before the session network response arrived.
          setOnboarded(prev => prev || snapshot.settings!.onboarded);
          setCanPersistSession(true);
          if (snapshot.settings.customRecipes) setCustomRecipes(snapshot.settings.customRecipes as Meal[]);
          const restoredDiscoverSaved = snapshot.settings.discoverSaved ?? [];
          const restoredDiscoverRejected = snapshot.settings.discoverRejected ?? [];
          if (snapshot.settings.discoverSaved) setDiscoverSaved(restoredDiscoverSaved as Meal[]);
          if (snapshot.settings.discoverRejected) setDiscoverRejected(restoredDiscoverRejected as Meal[]);
          if (snapshot.settings.discoverReviewedRecipeIds) {
            setDiscoverReviewedRecipeIds(snapshot.settings.discoverReviewedRecipeIds);
          } else {
            setDiscoverReviewedRecipeIds(
              Array.from(
                new Set(
                  [...restoredDiscoverSaved, ...restoredDiscoverRejected]
                    .map((recipe) => recipe.id)
                    .filter((id): id is string => typeof id === "string" && id.length > 0),
                ),
              ),
            );
          }
          if (snapshot.settings.calendarProvider) setCalendarProvider(snapshot.settings.calendarProvider as CalendarProvider);
          if (snapshot.settings.calendarEvents) setCalendarEvents(snapshot.settings.calendarEvents as CalendarEvent[]);
          if (snapshot.settings.icsSubscriptions) setIcsSubscriptions(snapshot.settings.icsSubscriptions as IcsSubscription[]);
          if (snapshot.settings.calendarTokens) setCalendarTokens(snapshot.settings.calendarTokens as CalendarToken[]);
          setPlan(restoreSessionPlan(snapshot.settings.plan, initialPlan));
          if (snapshot.settings.planMeals) {
            const restoredPlanMeals = snapshot.settings.planMeals as Meal[];
            registerPlanMeals(restoredPlanMeals);
            setPlanMeals(restoredPlanMeals);
          }
          if (snapshot.settings.planSignature) setPlanSignature(snapshot.settings.planSignature);
          if (snapshot.settings.planGeneratedAt) setPlanGeneratedAt(snapshot.settings.planGeneratedAt);
          if (snapshot.settings.calendarSkipped) setCalendarSkipped(snapshot.settings.calendarSkipped);
          if (snapshot.settings.privacyConsent) setPrivacyConsentState(snapshot.settings.privacyConsent);
        } else if (screenFromLocation() === "onboarding") {
          // No saved session but the user refreshed mid-onboarding — enable
          // persistence immediately so choices made before the refresh are
          // written back and survive a second refresh.
          setCanPersistSession(true);
        }

        // Data for this sessionId is now in state — saves may resume. Only clear
        // for the live load (a newer sessionId switch will have set it true again).
        sessionLoadPendingRef.current = false;
        setSessionLoaded(true);
      })
      .catch(error => {
        if (!cancelled) {
          console.warn("Anonymous session settings could not be loaded.", error);
          sessionLoadPendingRef.current = false;
          setSessionLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const saveSettingsDebounceRef = useRef<number | null>(null);
  const saveSettingsCooldownRef = useRef(false);

  const buildSessionSettings = useCallback((overrides: {
    plan?: PlanEntry[];
    planMeals?: Meal[];
    planGeneratedAt?: string;
    planSignature?: string;
    calendarSkipped?: boolean;
    privacyConsent?: PrivacyConsent;
  } = {}) => createSessionSettings({
    preferences: prefs,
    deadlines,
    selectedSources,
    onboarded,
    calendarProvider,
    customRecipes,
    discoverSaved,
    discoverRejected,
    discoverReviewedRecipeIds,
    plan: overrides.plan ?? plan,
    planMeals: overrides.planMeals ?? planMeals,
    calendarEvents,
    icsSubscriptions,
    calendarTokens,
    planSignature: overrides.planSignature ?? planSignature,
    planGeneratedAt: overrides.planGeneratedAt ?? planGeneratedAt,
    calendarSkipped: overrides.calendarSkipped ?? calendarSkipped,
    privacyConsent: overrides.privacyConsent ?? privacyConsent,
  }), [
    calendarEvents,
    calendarProvider,
    calendarTokens,
    customRecipes,
    deadlines,
    discoverRejected,
    discoverReviewedRecipeIds,
    discoverSaved,
    icsSubscriptions,
    calendarSkipped,
    onboarded,
    plan,
    planMeals,
    planGeneratedAt,
    planSignature,
    privacyConsent,
    prefs,
    selectedSources,
  ]);

  const saveCurrentSessionNow = useCallback(async () => {
    const snapshot = await saveAnonymousSessionSettings(sessionId, buildSessionSettings());
    if (snapshot.sessionId !== sessionId) {
      setSessionId(snapshot.sessionId);
    }
    return snapshot;
  }, [buildSessionSettings, sessionId]);

  const autoPlanAttemptRef = useRef<string | null>(null);

  const completeOnboardingAfterAccountCreated = useCallback(() => {
    autoPlanAttemptRef.current = null;
    enableSessionPersistence();
    setOnboarded(true);
    syncRecommenderUser(sessionId, prefs).catch((error) => {
      console.warn("Recommender user profile could not be created.", error);
    });
    navigateScreen("dashboard");
  }, [enableSessionPersistence, navigateScreen, prefs, sessionId]);

  useEffect(() => {
    // Drive the post-email-link destination ourselves using isNewUser; suppress
    // the onAuthStateChanged listener so it can't resolve a destination first
    // (without the isNewUser signal) and win the de-duped resolution race.
    suppressAuthStateDestinationRef.current = true;
    completeDeadlineFoodEmailLinkSignIn()
      .then((completion) => {
        if (completion) {
          track("account_linked", { provider: "email" });
          if (!completion.isNewUser) {
            // The link matched an account that already existed: go straight to
            // the dashboard with their synced plan, never back through onboarding.
            void resolveSignInDestination({ existingAccount: true });
          } else if (completion.intent === "create") {
            completeOnboardingAfterAccountCreated();
          } else {
            void resolveSignInDestination();
          }
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Email sign-in could not be completed.";
        notifyAccount(message, "error");
      })
      .finally(() => {
        suppressAuthStateDestinationRef.current = false;
      });
  }, [completeOnboardingAfterAccountCreated, notifyAccount, resolveSignInDestination, track]);

  const connectAccount = useCallback(async (provider: AccountProviderId) => {
    setAccountBusy(provider);
    notifyAccount("");
    suppressAuthStateDestinationRef.current = true;
    try {
      // Popup for every provider, including Microsoft: signInWithRedirect drops
      // its result on Firebase JS SDK v12 when the app origin differs from
      // authDomain (browser third-party-storage partitioning), so the redirect
      // never came back. Popup keeps the page alive and delivers the result via
      // the opener. In onboarding/settings this is account creation or linking,
      // not existing-account lookup from the landing page.
      await linkDeadlineFoodAccount(provider);
      track("account_linked", { provider });
      if (screen === "onboarding") {
        completeOnboardingAfterAccountCreated();
      } else {
        notifyAccount("Account connected.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Account sign-in failed.";
      notifyAccount(message, "error");
      track("account_link_failed", { provider, error: message });
    } finally {
      suppressAuthStateDestinationRef.current = false;
      setAccountBusy(null);
    }
  }, [completeOnboardingAfterAccountCreated, notifyAccount, screen, track]);

  const signInToExistingAccount = useCallback(async (provider: AccountProviderId) => {
    setAccountBusy(provider);
    notifyAccount("");
    suppressAuthStateDestinationRef.current = true;
    try {
      const result = await signInExistingDeadlineFoodAccount(provider);
      track("account_linked", { provider });
      await resolveSignInDestination({ existingAccount: !result.isNewUser });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Account sign-in failed.";
      notifyAccount(message, "error");
      track("account_link_failed", { provider, error: message });
    } finally {
      suppressAuthStateDestinationRef.current = false;
      setAccountBusy(null);
    }
  }, [notifyAccount, resolveSignInDestination, track]);

  const sendEmailMagicLink = useCallback(async (email: string, options?: EmailMagicLinkOptions) => {
    setAccountBusy("email");
    notifyAccount("");
    try {
      await sendDeadlineFoodEmailMagicLink(email, options);
      notifyAccount("Check your email for a sign-in link. Open it in this browser to save your plan.");
      track("account_magic_link_sent", {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Magic link could not be sent.";
      notifyAccount(message, "error");
      track("account_magic_link_failed", { error: message });
    } finally {
      setAccountBusy(null);
    }
  }, [notifyAccount, track]);

  const returnToAnonymousAccount = useCallback(async () => {
    setAccountBusy("anonymous");
    notifyAccount("");
    try {
      const nextAccount = await switchToAnonymousAccountOnThisDevice();
      setAccount(nextAccount);
      await saveCurrentSessionNow();
      notifyAccount("This device is using an anonymous account again.");
      track("account_signed_out", {});
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not switch account.";
      notifyAccount(message, "error");
    } finally {
      setAccountBusy(null);
    }
  }, [notifyAccount, saveCurrentSessionNow, track]);

  const logoutAccount = useCallback(async () => {
    setAccountBusy("logout");
    notifyAccount("");
    try {
      await signOutDeadlineFoodAccount();
      track("account_signed_out", {});
      clearStoredAnonymousSessionId();
      window.location.hash = "/landing";
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not log out.";
      notifyAccount(message, "error");
      setAccountBusy(null);
    }
  }, [notifyAccount, track]);

  const deleteAccount = useCallback(async () => {
    setAccountBusy("delete");
    notifyAccount("");
    try {
      // Backend deletes the synced profile document AND the Firebase Auth user
      // (keyed by the verified token), then we clear the now-invalid local
      // session. Order matters: the DELETE needs the still-valid token.
      await deleteAccountProfile();
      await signOutDeadlineFoodAccount();
      track("account_deleted", {});
      // The account and its synced session are gone. Start the device over from
      // a brand new anonymous session by clearing the stored handle and reloading
      // so every piece of in-memory state re-initialises cleanly.
      clearStoredAnonymousSessionId();
      window.location.hash = "/landing";
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete account.";
      notifyAccount(message, "error");
      setAccountBusy(null);
    }
  }, [notifyAccount, track]);

  useEffect(() => {
    if (!sessionLoaded || !canPersistSession || sessionLoadPendingRef.current) return;

    const doSave = () => {
      saveAnonymousSessionSettings(
        sessionId,
        buildSessionSettings(),
      ).catch(error => {
        console.warn("Anonymous session settings could not be saved.", error);
      });
    };

    if (!saveSettingsCooldownRef.current) {
      doSave();
      saveSettingsCooldownRef.current = true;
      saveSettingsDebounceRef.current = window.setTimeout(() => {
        saveSettingsCooldownRef.current = false;
        saveSettingsDebounceRef.current = null;
      }, 600);
    } else {
      if (saveSettingsDebounceRef.current !== null) {
        window.clearTimeout(saveSettingsDebounceRef.current);
      }
      saveSettingsDebounceRef.current = window.setTimeout(() => {
        doSave();
        saveSettingsCooldownRef.current = false;
        saveSettingsDebounceRef.current = null;
      }, 600);
    }

    return () => {
      if (saveSettingsDebounceRef.current !== null) {
        window.clearTimeout(saveSettingsDebounceRef.current);
      }
    };
  }, [buildSessionSettings, canPersistSession, sessionId, sessionLoaded]);

  useEffect(() => {
    if (!sessionLoaded) {
      return;
    }

    if (screen === "privacy-policy") {
      return;
    }

    if (onboarded && !hasPrivacyConsent) {
      routeHistory.current = [];
      pendingHashScreen.current = "onboarding";
      replaceScreenUrl("onboarding");
      const timer = window.setTimeout(() => setScreen("onboarding"), 0);
      return () => window.clearTimeout(timer);
    }

    if (onboarded && onboardingScreens.has(screen)) {
      routeHistory.current = [];
      pendingHashScreen.current = "dashboard";
      replaceScreenUrl("dashboard");
      const timer = window.setTimeout(() => setScreen("dashboard"), 0);
      return () => window.clearTimeout(timer);
    }

    if (!onboarded && isAppScreen(screen)) {
      routeHistory.current = [];
      pendingHashScreen.current = "landing";
      replaceScreenUrl("landing");
      const timer = window.setTimeout(() => setScreen("landing"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [hasPrivacyConsent, onboarded, screen, sessionLoaded]);

  // Derive the screen to render: if onboarded, pre-onboarding screens resolve to dashboard immediately
  const activeScreen: Screen = onboarded && !hasPrivacyConsent && screen !== "privacy-policy"
    ? "onboarding"
    : (onboarded && hasPrivacyConsent && (screen === "onboarding" || screen === "landing")) ? "dashboard" : screen;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeScreen]);

  // Saved-recipe pool for auto-planning: Discover saves + custom recipes, deduped.
  const savedRecipes = useMemo(() => {
    const byId = new Map<string, Meal>();
    for (const meal of [...customRecipes, ...discoverSaved]) {
      if (meal?.id) byId.set(meal.id, meal);
    }
    return [...byId.values()];
  }, [customRecipes, discoverSaved]);

  // Keep the session-meal fallback registry in sync so mealById/getMealById still
  // resolve a saved recipe after its creator unpublishes it (issue #200).
  useEffect(() => {
    registerSessionMeals(savedRecipes);
  }, [savedRecipes]);

  // Community recipes the user saved or planned that have dropped out of the
  // public catalogue (their owner unpublished or deleted them). We can't tell
  // "unpublished" (still usable) from "deleted" (gone) from catalogue absence
  // alone, so reconcile their current state with the backend. Gate on
  // catalogueVersion so we never flag before Firestore hydration completes.
  const unlistedCommunityIds = useMemo(() => {
    if (catalogueVersion === 0) return [] as string[];
    const catalogueIds = new Set(getRecipeCatalogue().map((meal) => meal.id));
    const ids = new Set<string>();
    const consider = (id: string | undefined, meal: Meal | undefined) => {
      if (!id || catalogueIds.has(id)) return;
      // Skip the user's own recipes and curated seeds — only other people's
      // recipes can be unpublished/deleted out from under the user.
      if (meal && (meal.isUserCreated || isVerified(meal))) return;
      ids.add(id);
    };
    for (const meal of discoverSaved) consider(meal.id, meal);
    for (const entry of plan) {
      for (const planMeal of entry.meals) consider(planMeal.mealId, mealById(planMeal.mealId, customRecipes));
    }
    return [...ids];
  }, [discoverSaved, plan, customRecipes, catalogueVersion]);

  const [recipeStates, setRecipeStates] = useState<Record<string, RecipeState>>({});

  useEffect(() => {
    let cancelled = false;
    fetchRecipeStates(unlistedCommunityIds)
      .then((states) => { if (!cancelled) setRecipeStates(states); })
      .catch((error) => { console.warn("Recipe states could not be loaded.", error); });
    return () => { cancelled = true; };
  }, [unlistedCommunityIds]);

  const deletedRecipeIds = useMemo(
    () => new Set(Object.keys(recipeStates).filter((id) => recipeStates[id] === "deleted")),
    [recipeStates],
  );
  const unpublishedRecipeIds = useMemo(
    () => new Set(Object.keys(recipeStates).filter((id) => recipeStates[id] === "unpublished")),
    [recipeStates],
  );

  const currentPlanSignature = useMemo(
    () => computePlanSignature({ prefs, savedRecipes, calendarEvents, deadlines, selectedSources }),
    [prefs, savedRecipes, calendarEvents, deadlines, selectedSources],
  );

  // A plan is stale if it was never generated or its inputs have since changed.
  const planStale = planGeneratedAt === undefined || planSignature !== currentPlanSignature;

  const regeneratePlan = useCallback(async () => {
    setPlanGenerating(true);
    try {
      const result = await generateAutoPlan({
        sessionId,
        prefs,
        savedRecipes,
        calendarEvents,
        deadlines,
        excludeIds: discoverRejected.map((meal) => meal.id),
      });
      if (result.plan.length === 0) {
        throw new Error("Auto-plan generation returned an empty plan.");
      }
      setPlan(result.plan);
      setPlanMeals(result.meals);
      setPlanGeneratedAt(result.generatedAt);
      setPlanSignature(currentPlanSignature);
      setCanPersistSession(true);
      if (saveSettingsDebounceRef.current !== null) {
        window.clearTimeout(saveSettingsDebounceRef.current);
        saveSettingsDebounceRef.current = null;
      }
      saveSettingsCooldownRef.current = false;
      try {
        await saveAnonymousSessionSettings(
          sessionId,
          buildSessionSettings({
            plan: result.plan,
            planMeals: result.meals,
            planGeneratedAt: result.generatedAt,
            planSignature: currentPlanSignature,
          }),
        );
      } catch (error) {
        console.warn("Generated auto-plan could not be saved immediately.", error);
        track("auto_plan_persistence_failed", {});
      }
      track("auto_plan_generated", {
        horizon_days: prefs.planningHorizonDays,
        day_count: result.plan.length,
        saved_recipe_count: savedRecipes.length,
      });
    } catch (error) {
      console.warn("Auto-plan generation failed.", error);
      track("auto_plan_generation_failed", {});
    } finally {
      setPlanGenerating(false);
    }
  }, [sessionId, prefs, savedRecipes, calendarEvents, deadlines, discoverRejected, currentPlanSignature, buildSessionSettings, track]);

  // Generate the first plan automatically once onboarded (also upgrades existing
  // users off the seed/mock plan). Thereafter "prompt" mode shows a banner and
  // "auto" mode regenerates silently when the plan goes stale.
  useEffect(() => {
    if (!sessionLoaded || !onboarded || !hasPrivacyConsent || planGenerating) return;
    const needsFirstPlan = planGeneratedAt === undefined;
    const autoRefresh = prefs.planRegenMode === "auto" && planStale;
    if (!needsFirstPlan && !autoRefresh) return;
    // Attempt each distinct input set at most once automatically, so a backend
    // outage can't trigger a regeneration loop. Manual regenerate is unaffected.
    if (autoPlanAttemptRef.current === currentPlanSignature) return;
    autoPlanAttemptRef.current = currentPlanSignature;
    // Defer so generation runs after commit (not a synchronous setState in the effect).
    let fired = false;
    const timer = setTimeout(() => { fired = true; void regeneratePlan(); }, 0);
    return () => {
      clearTimeout(timer);
      if (!fired) autoPlanAttemptRef.current = null;
    };
  }, [sessionLoaded, onboarded, hasPrivacyConsent, planGenerating, planGeneratedAt, planStale, prefs.planRegenMode, currentPlanSignature, regeneratePlan]);

  function openRecipe(mealId: string) {
    track("recipe_viewed", { meal_id: mealId, source_screen: activeScreen });
    setSelectedMealId(mealId);
    setSharedRecipe(null);
    setSharedRecipeStatus("idle");
    // Deep-linkable, shareable URL keyed by the recipe's public share slug (#213).
    navigateScreen("recipe-detail", `/#/recipe/${shareIdForRecipe(mealId)}`);
  }

  // Resolve a `#/recipe/<shareId>` deep link: prefer a locally-known recipe,
  // otherwise fetch the shared recipe from the backend (#213). State updates are
  // made inside promise callbacks so the URL→state sync stays off the
  // synchronous effect body.
  useEffect(() => {
    if (screen !== "recipe-detail") return;
    const token = recipeShareToken(window.location.hash);
    if (!token) return;
    // Already showing the right recipe (e.g. arrived here via openRecipe).
    if (shareIdForRecipe(selectedMealId) === token) return;

    let cancelled = false;
    const candidates = [...customRecipes, ...discoverSaved, ...planMeals, ...getRecipeCatalogue()];
    const local = candidates.find((meal) => shareIdForRecipe(meal.id) === token);

    if (local) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setSharedRecipe(null);
        setSharedRecipeStatus("idle");
        setSelectedMealId(local.id);
      });
      return () => { cancelled = true; };
    }

    // Foreign recipe: show a loading state rather than the default recipe while
    // we resolve it, so a slow/failed fetch never surfaces the wrong recipe.
    Promise.resolve().then(() => { if (!cancelled) setSharedRecipeStatus("loading"); });

    fetchSharedRecipe(token)
      .then((fetched) => {
        if (cancelled) return;
        if (fetched) {
          setSharedRecipe(fetched);
          setSharedRecipeStatus("idle");
          setSelectedMealId(fetched.id);
        } else {
          // 404 — unpublished, deleted, or a broken link.
          setSharedRecipe(null);
          setSharedRecipeStatus("unavailable");
        }
      })
      .catch((error) => {
        // Network/backend error — still don't fall back to the default recipe.
        console.warn("Shared recipe could not be loaded.", error);
        if (!cancelled) {
          setSharedRecipe(null);
          setSharedRecipeStatus("unavailable");
        }
      });

    return () => { cancelled = true; };
  }, [screen, locationTick, catalogueVersion, selectedMealId, customRecipes, discoverSaved, planMeals]);

  function openAddToPlan(mealId: string) {
    track("recipe_add_to_plan_clicked", { meal_id: mealId, source_screen: activeScreen });
    try { sessionStorage.setItem("deadlineFood:addToPlanMealId", mealId); } catch { /* sessionStorage unavailable */ }
    navigateScreen("plan");
  }

  function openDiscover(day: string, slot: MealSlot, mealId: string) {
    track("meal_card_discover_clicked", { day, meal_slot: slot, meal_id: mealId });
    const nextDiscoverContext = { day, slot, mealId };
    setDiscoverContext(nextDiscoverContext);
    requestDiscoverRecommendations("route_entry", nextDiscoverContext);
    navigateScreen("recipes");
  }

  if (!sessionLoaded || (onboarded && hasPrivacyConsent && onboardingScreens.has(screen)) || (!onboarded && isAppScreen(screen))) {
    return <LoadingScreen />;
  }

  if (activeScreen === "privacy-policy") {
    return (
      <PrivacyPolicyScreen
        consentRequired={onboarded && !hasPrivacyConsent}
        hasConsent={hasPrivacyConsent}
        setScreen={navigateScreen}
        previousScreen={previousScreen}
        track={track}
      />
    );
  }

  if (activeScreen === "landing") {
    return <Landing
      onStart={() => { notifyAccount(""); enableSessionPersistence(); navigateScreen("onboarding"); }}
      track={track}
      account={account}
      accountBusy={accountBusy}
      accountMessage={accountMessage}
      accountMessageTone={accountMessageTone}
      onConnectAccount={signInToExistingAccount}
      onSendEmailMagicLink={sendEmailMagicLink}
    />;
  }

  if (activeScreen === "onboarding") {
    return (
      <Onboarding
        setOnboarded={(nextOnboarded) => {
          enableSessionPersistence();
          if (nextOnboarded) {
            // Allow the first auto-plan to run for this input set even if the
            // signature was already attempted earlier this session (e.g. when a
            // user signs in at the start and then finishes onboarding). Without
            // this reset the auto-plan effect's de-dupe guard suppresses the
            // first plan generation. Mirrors completeOnboardingAfterAccountCreated.
            autoPlanAttemptRef.current = null;
            // Create + embed the user profile on the recommender at onboarding
            // time rather than lazily on first Discover load.
            syncRecommenderUser(sessionId, prefs).catch((error) => {
              console.warn("Recommender user profile could not be created.", error);
            });
          }
          setOnboarded(nextOnboarded);
        }}
        setScreen={navigateScreen}
        prefs={prefs}
        setPrefs={setPrefs}
        setDeadlines={setDeadlines}
        calendarEvents={calendarEvents}
        setCalendarEvents={setCalendarEvents}
        selectedSources={selectedSources}
        setSelectedSources={setSelectedSources}
        calendarProvider={calendarProvider}
        setCalendarProvider={setCalendarProvider}
        icsSubscriptions={icsSubscriptions}
        setIcsSubscriptions={setIcsSubscriptions}
        calendarTokens={calendarTokens}
        setCalendarTokens={setCalendarTokens}
        sessionId={sessionId}
        account={account}
        accountMessage={accountMessage}
        accountMessageTone={accountMessageTone}
        accountBusy={accountBusy}
        onConnectAccount={connectAccount}
        onSendEmailMagicLink={sendEmailMagicLink}
        onUseAnonymousAccount={returnToAnonymousAccount}
        onClearAccountMessage={() => notifyAccount("")}
        track={track}
        setCalendarSkipped={setCalendarSkipped}
        privacyConsent={privacyConsent}
        setPrivacyConsent={setPrivacyConsent}
        initialStep={onboarded && !hasPrivacyConsent ? 2 : undefined}
      />
    );
  }

  return (
    <Shell screen={activeScreen} setScreen={navigateScreen} previousScreen={previousScreen} onBack={navigateBack} onboarded={onboarded} track={track}>
      {activeScreen === "dashboard" && <Dashboard prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} discoverSaved={discoverSaved} setScreen={navigateScreen} onSelectMeal={openRecipe} planStale={planStale} planGenerated={planGeneratedAt !== undefined} regenerating={planGenerating} onRegenerate={regeneratePlan} openDiscover={openDiscover} track={track} calendarSkipped={calendarSkipped} deletedRecipeIds={deletedRecipeIds} unpublishedRecipeIds={unpublishedRecipeIds} />}
      {activeScreen === "calendar" && <CalendarScreen deadlines={deadlines} setDeadlines={setDeadlines} calendarEvents={calendarEvents} plan={plan} customRecipes={customRecipes} prefs={prefs} setScreen={navigateScreen} track={track} />}
      {activeScreen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} discoverSaved={discoverSaved} setScreen={navigateScreen} onSelectMeal={openRecipe} planStale={planStale} planGenerated={planGeneratedAt !== undefined} regenerating={planGenerating} onRegenerate={regeneratePlan} regenMode={prefs.planRegenMode} openDiscover={openDiscover} track={track} deletedRecipeIds={deletedRecipeIds} unpublishedRecipeIds={unpublishedRecipeIds} />}
      {activeScreen === "recipes" && <RecipesHubScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} discoverRejected={discoverRejected} setDiscoverRejected={setDiscoverRejected} discoverReviewedRecipeIds={discoverReviewedRecipeIds} setDiscoverReviewedRecipeIds={setDiscoverReviewedRecipeIds} discoverRecommendationState={discoverRecommendationState} setDiscoverRecommendationState={setDiscoverRecommendationState} requestRecommendations={requestDiscoverRecommendations} prefs={prefs} deadlines={deadlines} sessionId={sessionId} onSelectMeal={openRecipe} onAddToPlan={openAddToPlan} discoverContext={discoverContext} deletedRecipeIds={deletedRecipeIds} unpublishedRecipeIds={unpublishedRecipeIds} track={track} />}
      {activeScreen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={navigateScreen} calendarProvider={calendarProvider} setCalendarProvider={setCalendarProvider} setDeadlines={setDeadlines} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} icsSubscriptions={icsSubscriptions} setIcsSubscriptions={setIcsSubscriptions} calendarTokens={calendarTokens} setCalendarTokens={setCalendarTokens} sessionId={sessionId} account={account} accountMessage={accountMessage} accountMessageTone={accountMessageTone} accountBusy={accountBusy} onConnectAccount={connectAccount} onSendEmailMagicLink={sendEmailMagicLink} onLogout={logoutAccount} onDeleteAccount={deleteAccount} track={track} />}
      {activeScreen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} sharedRecipe={sharedRecipe} account={account} sharedRecipeStatus={sharedRecipeStatus} setScreen={navigateScreen} backTo={previousScreen} onSelectMeal={openRecipe} deletedRecipeIds={deletedRecipeIds} unpublishedRecipeIds={unpublishedRecipeIds} track={track} unitSystem={prefs.unitSystem} />}
    </Shell>
  );
}
