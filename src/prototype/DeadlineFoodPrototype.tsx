import { useCallback, useEffect, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";

import { capturePostHogEvent, registerPostHogContext, registerPostHogSession, type AnalyticsProperties } from "@/lib/posthog";
import { defaultDeadlines, initialPlan, initialPreferences } from "./data";
import type { CalendarEvent, CalendarProvider, Deadline, Meal, PlanEntry, Preferences, Screen } from "./types";
import {
  getOrCreateAnonymousSessionId,
  loadAnonymousSessionSettings,
  saveAnonymousSessionSettings,
} from "./anonymousSessionApi";
import { createPrototypeSessionSettings, restorePrototypePlan, type CalendarToken, type IcsSubscription } from "./sessionPersistence";
import { Shell } from "./components/Shell";
import { CalendarScreen } from "./screens/CalendarScreen";
import { Dashboard } from "./screens/Dashboard";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";
import { PlanScreen } from "./screens/PlanScreen";
import { RecipeDetailScreen } from "./screens/RecipeDetailScreen";
import { RecipesHubScreen } from "./screens/RecipesHubScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

const screens: Screen[] = ["landing", "onboarding", "dashboard", "calendar", "plan", "recipes", "settings", "recipe-detail"];
const onboardingScreens = new Set<Screen>(["landing", "onboarding"]);

function screenFromHash(): Screen | null {
  if (typeof window === "undefined") return null;

  const value = window.location.hash.replace("#/", "") as Screen;
  return screens.includes(value) ? value : null;
}

function isAppScreen(screen: Screen): boolean {
  return !onboardingScreens.has(screen);
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

export function DeadlineFoodPrototype() {
  const posthog = usePostHog();
  const [sessionId] = useState(() => getOrCreateAnonymousSessionId());
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [canPersistSession, setCanPersistSession] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? "landing");
  const routeHistory = useRef<Screen[]>([]);
  const pendingHashScreen = useRef<Screen | null>(null);
  const [previousScreen, setPreviousScreen] = useState<Screen | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [calendarProvider, setCalendarProvider] = useState<CalendarProvider>("google");
  const [deadlines, setDeadlines] = useState<Deadline[]>(defaultDeadlines);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [selectedSources, setSelectedSources] = useState(["budget", "bbc", "own", "campus"]);
  const [plan, setPlan] = useState<PlanEntry[]>(initialPlan);
  const [customRecipes, setCustomRecipes] = useState<Meal[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [discoverSaved, setDiscoverSaved] = useState<Meal[]>([]);
  const [discoverRejected, setDiscoverRejected] = useState<Meal[]>([]);
  const [discoverReviewedRecipeIds, setDiscoverReviewedRecipeIds] = useState<string[]>([]);
  const [icsSubscriptions, setIcsSubscriptions] = useState<IcsSubscription[]>([]);
  const [calendarTokens, setCalendarTokens] = useState<CalendarToken[]>([]);
  const [selectedMealId, setSelectedMealId] = useState(initialPlan[0]?.meals[0]?.mealId ?? "m1");
  const syncPreviousScreen = useCallback(() => {
    setPreviousScreen(routeHistory.current.at(-1) ?? null);
  }, []);

  const enableSessionPersistence = useCallback(() => {
    setCanPersistSession(true);
  }, []);

  const navigateScreen = useCallback((nextScreen: Screen) => {
    if (screen === nextScreen) return;
    enableSessionPersistence();
    routeHistory.current = [...routeHistory.current, screen].slice(-20);
    syncPreviousScreen();
    pendingHashScreen.current = nextScreen;
    window.location.hash = `/${nextScreen}`;
    setScreen(nextScreen);
  }, [enableSessionPersistence, screen, syncPreviousScreen]);

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
    window.location.hash = `/${nextScreen}`;
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
    function onHashChange() {
      const nextScreen = screenFromHash();
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

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [syncPreviousScreen]);

  useEffect(() => {
    registerPostHogContext(posthog, {
      current_screen: screen,
      prototype_onboarded: onboarded,
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
    track("prototype_screen_viewed", { screen });
  }, [screen, track]);

  useEffect(() => {
    let cancelled = false;

    loadAnonymousSessionSettings(sessionId)
      .then(snapshot => {
        if (cancelled) return;

        if (snapshot.settings !== null) {
          setPrefs(snapshot.settings.preferences);
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
          if (snapshot.settings.calendarEvents) setCalendarEvents(snapshot.settings.calendarEvents as CalendarEvent[]);
          if (snapshot.settings.icsSubscriptions) setIcsSubscriptions(snapshot.settings.icsSubscriptions as IcsSubscription[]);
          if (snapshot.settings.calendarTokens) setCalendarTokens(snapshot.settings.calendarTokens as CalendarToken[]);
          setPlan(restorePrototypePlan(snapshot.settings.plan, initialPlan));
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

  useEffect(() => {
    if (!sessionLoaded || !canPersistSession) return;

    const doSave = () => {
      saveAnonymousSessionSettings(
        sessionId,
        createPrototypeSessionSettings({
          preferences: prefs,
          deadlines,
          selectedSources,
          onboarded,
          customRecipes,
          discoverSaved,
          discoverRejected,
          discoverReviewedRecipeIds,
          plan,
          calendarEvents,
          icsSubscriptions,
          calendarTokens,
        }),
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
  }, [calendarEvents, calendarTokens, canPersistSession, customRecipes, deadlines, discoverRejected, discoverReviewedRecipeIds, discoverSaved, icsSubscriptions, onboarded, plan, prefs, selectedSources, sessionId, sessionLoaded]);

  useEffect(() => {
    if (!sessionLoaded) {
      return;
    }

    if (onboarded && onboardingScreens.has(screen)) {
      routeHistory.current = [];
      pendingHashScreen.current = "dashboard";
      window.location.hash = "/dashboard";
      return;
    }

    if (!onboarded && isAppScreen(screen)) {
      routeHistory.current = [];
      pendingHashScreen.current = "landing";
      window.location.hash = "/landing";
    }
  }, [onboarded, screen, sessionLoaded]);

  useEffect(() => {
    if (onboarded && (screen === "onboarding" || screen === "landing")) {
      routeHistory.current = routeHistory.current.filter(
        s => s !== "onboarding" && s !== "landing"
      );
      syncPreviousScreen();
      pendingHashScreen.current = "dashboard";
      window.location.hash = "/dashboard";
      // onHashChange will call setScreen("dashboard") once the hashchange event fires
    }
  }, [onboarded, screen, syncPreviousScreen]);

  // Derive the screen to render: if onboarded, pre-onboarding screens resolve to dashboard immediately
  const activeScreen: Screen = (onboarded && (screen === "onboarding" || screen === "landing")) ? "dashboard" : screen;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeScreen]);

  function openRecipe(mealId: string) {
    track("recipe_viewed", { meal_id: mealId, source_screen: activeScreen });
    setSelectedMealId(mealId);
    navigateScreen("recipe-detail");
  }

  if (!sessionLoaded || (onboarded && onboardingScreens.has(screen)) || (!onboarded && isAppScreen(screen))) {
    return <LoadingScreen />;
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
        }}
        setScreen={navigateScreen}
        prefs={prefs}
        setPrefs={setPrefs}
        deadlines={deadlines}
        setDeadlines={setDeadlines}
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
      />
    );
  }

  return (
    <Shell screen={activeScreen} setScreen={navigateScreen} previousScreen={previousScreen} onBack={navigateBack} onboarded={onboarded} track={track}>
      {activeScreen === "dashboard" && <Dashboard prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} setScreen={navigateScreen} onSelectMeal={openRecipe} track={track} />}
      {activeScreen === "calendar" && <CalendarScreen deadlines={deadlines} setDeadlines={setDeadlines} setScreen={navigateScreen} track={track} />}
      {activeScreen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} setScreen={navigateScreen} onSelectMeal={openRecipe} track={track} />}
      {activeScreen === "recipes" && <RecipesHubScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} discoverRejected={discoverRejected} setDiscoverRejected={setDiscoverRejected} discoverReviewedRecipeIds={discoverReviewedRecipeIds} setDiscoverReviewedRecipeIds={setDiscoverReviewedRecipeIds} plan={plan} setPlan={setPlan} prefs={prefs} deadlines={deadlines} sessionId={sessionId} onSelectMeal={openRecipe} track={track} />}
      {activeScreen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={navigateScreen} calendarProvider={calendarProvider} setCalendarProvider={setCalendarProvider} setDeadlines={setDeadlines} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} icsSubscriptions={icsSubscriptions} setIcsSubscriptions={setIcsSubscriptions} calendarTokens={calendarTokens} setCalendarTokens={setCalendarTokens} sessionId={sessionId} track={track} />}
      {activeScreen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} setScreen={navigateScreen} backTo={previousScreen} onSelectMeal={openRecipe} track={track} />}
    </Shell>
  );
}
