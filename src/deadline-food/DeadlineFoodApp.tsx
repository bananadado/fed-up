import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";

import { capturePostHogEvent, registerPostHogContext, registerPostHogSession, type AnalyticsProperties } from "@/lib/posthog";
import { initialPlan, initialPreferences } from "./data";
import type { CalendarEvent, CalendarProvider, Deadline, DiscoverRecommendationState, Meal, MealSlot, PlanEntry, Preferences, Screen } from "./types";
import {
  getOrCreateAnonymousSessionId,
  loadAnonymousSessionSettings,
  saveAnonymousSessionSettings,
} from "./anonymousSessionApi";
import {
  PRIVACY_POLICY_URL,
  createPrivacyConsent,
  createSessionSettings,
  hasCurrentPrivacyConsent,
  normalizePreferences,
  restoreSessionPlan,
  type CalendarToken,
  type IcsSubscription,
  type PrivacyConsent,
} from "./sessionPersistence";
import { syncRecommenderUser } from "./recommenderApi";
import { computePlanSignature, generateAutoPlan } from "./autoPlanApi";
import { fetchRecipeCatalogue, setRecipeCatalogue } from "./recipeCatalogue";
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

function screenFromLocation(): Screen | null {
  if (typeof window === "undefined") return null;

  if (window.location.pathname.replace(/\/$/, "") === PRIVACY_POLICY_URL) {
    return "privacy-policy";
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
  const [sessionId] = useState(() => getOrCreateAnonymousSessionId());
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [canPersistSession, setCanPersistSession] = useState(false);
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
  const [discoverRecommendationState, setDiscoverRecommendationState] = useState<DiscoverRecommendationState>({
    contextKey: "",
    recipes: [],
    status: "idle",
  });
  const [icsSubscriptions, setIcsSubscriptions] = useState<IcsSubscription[]>([]);
  const [calendarTokens, setCalendarTokens] = useState<CalendarToken[]>([]);
  const [privacyConsent, setPrivacyConsentState] = useState<PrivacyConsent | undefined>(undefined);
  const [policyScreenAccepted, setPolicyScreenAccepted] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState(initialPlan[0]?.meals[0]?.mealId ?? "m1");
  const [calendarSkipped, setCalendarSkipped] = useState(false);
  // Auto-planning (issue #66): the signature/timestamp the current plan was
  // generated from, so we can detect when it has gone stale.
  const [planSignature, setPlanSignature] = useState<string | undefined>(undefined);
  const [planGeneratedAt, setPlanGeneratedAt] = useState<string | undefined>(undefined);
  const [planGenerating, setPlanGenerating] = useState(false);
  const [discoverContext, setDiscoverContext] = useState<{ day: string; slot: MealSlot; mealId: string } | null>(null);
  // Bumped once the canonical recipe catalogue is hydrated from Firestore so
  // screens re-read it via mealById/getMealById (issue #123).
  const [, setCatalogueVersion] = useState(0);
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

  const navigateScreen = useCallback((nextScreen: Screen) => {
    if (screen === nextScreen) return;
    if (nextScreen !== "recipes") setDiscoverContext(null);
    enableSessionPersistence();
    routeHistory.current = [...routeHistory.current, screen].slice(-20);
    syncPreviousScreen();
    pendingHashScreen.current = nextScreen;
    window.history.pushState({ screen: nextScreen }, "", urlForScreen(nextScreen));
    setScreen(nextScreen);
  }, [enableSessionPersistence, screen, syncPreviousScreen]);

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

  useEffect(() => {
    registerPostHogSession(posthog, sessionId);
  }, [posthog, sessionId]);

  useEffect(() => {
    function onLocationChange() {
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

    loadAnonymousSessionSettings(sessionId)
      .then(snapshot => {
        if (cancelled) return;

        if (snapshot.settings !== null) {
          setPrefs(normalizePreferences(snapshot.settings.preferences));
          setDeadlines(snapshot.settings.deadlines.map((d): Deadline => ({
            ...d,
            eventType: d.eventType ?? "general",
            effortHours: d.effortHours ?? 3,
            urgency: d.urgency ?? "medium",
          })));
          setSelectedSources(snapshot.settings.selectedSources);
          setOnboarded(snapshot.settings.onboarded);
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

        setSessionLoaded(true);
      })
      .catch(error => {
        if (!cancelled) {
          console.warn("Anonymous session settings could not be loaded.", error);
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
    planGeneratedAt,
    planSignature,
    privacyConsent,
    prefs,
    selectedSources,
  ]);

  useEffect(() => {
    if (!sessionLoaded || !canPersistSession) return;

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
      pendingHashScreen.current = "privacy-policy";
      replaceScreenUrl("privacy-policy");
      setScreen("privacy-policy");
      return;
    }

    if (onboarded && onboardingScreens.has(screen)) {
      routeHistory.current = [];
      pendingHashScreen.current = "dashboard";
      replaceScreenUrl("dashboard");
      setScreen("dashboard");
      return;
    }

    if (!onboarded && isAppScreen(screen)) {
      routeHistory.current = [];
      pendingHashScreen.current = "landing";
      replaceScreenUrl("landing");
      setScreen("landing");
    }
  }, [hasPrivacyConsent, onboarded, screen, sessionLoaded]);

  // Derive the screen to render: if onboarded, pre-onboarding screens resolve to dashboard immediately
  const activeScreen: Screen = onboarded && !hasPrivacyConsent && screen !== "privacy-policy"
    ? "privacy-policy"
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
  const autoPlanAttemptRef = useRef<string | null>(null);
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
    const timer = setTimeout(() => { void regeneratePlan(); }, 0);
    return () => clearTimeout(timer);
  }, [sessionLoaded, onboarded, hasPrivacyConsent, planGenerating, planGeneratedAt, planStale, prefs.planRegenMode, currentPlanSignature, regeneratePlan]);

  function openRecipe(mealId: string) {
    track("recipe_viewed", { meal_id: mealId, source_screen: activeScreen });
    setSelectedMealId(mealId);
    navigateScreen("recipe-detail");
  }

  function openAddToPlan(mealId: string) {
    track("recipe_add_to_plan_clicked", { meal_id: mealId, source_screen: activeScreen });
    try { sessionStorage.setItem("deadlineFood:addToPlanMealId", mealId); } catch { /* sessionStorage unavailable */ }
    navigateScreen("plan");
  }

  function openDiscover(day: string, slot: MealSlot, mealId: string) {
    track("meal_card_discover_clicked", { day, meal_slot: slot, meal_id: mealId });
    setDiscoverContext({ day, slot, mealId });
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
        accepted={hasPrivacyConsent || policyScreenAccepted}
        onAcceptedChange={setPolicyScreenAccepted}
        onAccept={() => {
          const consent = hasCurrentPrivacyConsent(privacyConsent) ? privacyConsent : createPrivacyConsent();
          setPrivacyConsent(consent);
          setPolicyScreenAccepted(false);
          track("privacy_policy_consented", {
            source: onboarded ? "policy_gate" : "privacy_policy_screen",
            privacy_policy_version: consent.policyVersion,
          });
          navigateScreen(onboarded ? "dashboard" : "onboarding");
        }}
        setScreen={navigateScreen}
        previousScreen={previousScreen}
        track={track}
      />
    );
  }

  if (activeScreen === "landing") {
    return <Landing onStart={() => {
      enableSessionPersistence();
      navigateScreen("onboarding");
    }} track={track} />;
  }

  if (activeScreen === "onboarding") {
    return (
      <Onboarding
        setOnboarded={(nextOnboarded) => {
          enableSessionPersistence();
          setOnboarded(nextOnboarded);
          if (nextOnboarded) {
            // Create + embed the user profile on the recommender at onboarding
            // time rather than lazily on first Discover load.
            syncRecommenderUser(sessionId, prefs).catch((error) => {
              console.warn("Recommender user profile could not be created.", error);
            });
          }
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
        track={track}
        setCalendarSkipped={setCalendarSkipped}
        privacyConsent={privacyConsent}
        setPrivacyConsent={setPrivacyConsent}
      />
    );
  }

  return (
    <Shell screen={activeScreen} setScreen={navigateScreen} previousScreen={previousScreen} onBack={navigateBack} onboarded={onboarded} track={track}>
      {activeScreen === "dashboard" && <Dashboard prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} discoverSaved={discoverSaved} setScreen={navigateScreen} onSelectMeal={openRecipe} planStale={planStale} planGenerated={planGeneratedAt !== undefined} regenerating={planGenerating} onRegenerate={regeneratePlan} openDiscover={openDiscover} track={track} calendarSkipped={calendarSkipped} />}
      {activeScreen === "calendar" && <CalendarScreen deadlines={deadlines} setDeadlines={setDeadlines} calendarEvents={calendarEvents} plan={plan} customRecipes={customRecipes} setScreen={navigateScreen} track={track} />}
      {activeScreen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} discoverSaved={discoverSaved} setScreen={navigateScreen} onSelectMeal={openRecipe} planStale={planStale} planGenerated={planGeneratedAt !== undefined} regenerating={planGenerating} onRegenerate={regeneratePlan} regenMode={prefs.planRegenMode} openDiscover={openDiscover} track={track} />}
      {activeScreen === "recipes" && <RecipesHubScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} discoverRejected={discoverRejected} setDiscoverRejected={setDiscoverRejected} discoverReviewedRecipeIds={discoverReviewedRecipeIds} setDiscoverReviewedRecipeIds={setDiscoverReviewedRecipeIds} discoverRecommendationState={discoverRecommendationState} setDiscoverRecommendationState={setDiscoverRecommendationState} prefs={prefs} deadlines={deadlines} sessionId={sessionId} onSelectMeal={openRecipe} onAddToPlan={openAddToPlan} discoverContext={discoverContext} track={track} />}
      {activeScreen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={navigateScreen} calendarProvider={calendarProvider} setCalendarProvider={setCalendarProvider} setDeadlines={setDeadlines} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} icsSubscriptions={icsSubscriptions} setIcsSubscriptions={setIcsSubscriptions} calendarTokens={calendarTokens} setCalendarTokens={setCalendarTokens} sessionId={sessionId} track={track} />}
      {activeScreen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} setScreen={navigateScreen} backTo={previousScreen} onSelectMeal={openRecipe} track={track} />}
    </Shell>
  );
}
