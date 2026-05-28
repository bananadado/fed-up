import { useCallback, useEffect, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";

import { capturePostHogEvent, registerPostHogContext, registerPostHogSession, type AnalyticsProperties } from "@/lib/posthog";
import { defaultDeadlines, initialPlan, initialPreferences } from "./data";
import type { CalendarProvider, Deadline, Meal, PlanEntry, Preferences, Screen } from "./types";
import {
  getOrCreateAnonymousSessionId,
  loadAnonymousSessionSettings,
  saveAnonymousSessionSettings,
} from "./anonymousSessionApi";
import { createPrototypeSessionSettings } from "./sessionPersistence";
import { Shell } from "./components/Shell";
import { CalendarScreen } from "./screens/CalendarScreen";
import { Dashboard } from "./screens/Dashboard";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";
import { PlanScreen } from "./screens/PlanScreen";
import { RecipeDetailScreen } from "./screens/RecipeDetailScreen";
import { RecipesScreen } from "./screens/RecipesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

const screens: Screen[] = ["landing", "onboarding", "dashboard", "calendar", "plan", "discover", "recipes", "settings", "recipe-detail"];

function screenFromHash(): Screen | null {
  if (typeof window === "undefined") return null;

  const value = window.location.hash.replace("#/", "") as Screen;
  return screens.includes(value) ? value : null;
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
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? "landing");
  const routeHistory = useRef<Screen[]>([]);
  const pendingHashScreen = useRef<Screen | null>(null);
  const [previousScreen, setPreviousScreen] = useState<Screen | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [calendarProvider, setCalendarProvider] = useState<CalendarProvider>("google");
  const [deadlines, setDeadlines] = useState<Deadline[]>(defaultDeadlines);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanEntry[]>(initialPlan);
  const [customRecipes, setCustomRecipes] = useState<Meal[]>([]);
  const [discoverSaved, setDiscoverSaved] = useState<Meal[]>([]);
  const [discoverRejected, setDiscoverRejected] = useState<Meal[]>([]);
  const [selectedMealId, setSelectedMealId] = useState(initialPlan[0]?.meals[0]?.mealId ?? "m1");
  const syncPreviousScreen = useCallback(() => {
    setPreviousScreen(routeHistory.current.at(-1) ?? null);
  }, []);

  const navigateScreen = useCallback((nextScreen: Screen) => {
    if (screen === nextScreen) return;
    routeHistory.current = [...routeHistory.current, screen].slice(-20);
    syncPreviousScreen();
    pendingHashScreen.current = nextScreen;
    window.location.hash = `/${nextScreen}`;
    setScreen(nextScreen);
  }, [screen, syncPreviousScreen]);

  const navigateBack = useCallback(() => {
    const fallbackScreen: Screen = "dashboard";
    const nextScreen = routeHistory.current.pop() ?? fallbackScreen;

    syncPreviousScreen();

    if (screen === nextScreen) {
      return;
    }

    pendingHashScreen.current = nextScreen;
    window.location.hash = `/${nextScreen}`;
    setScreen(nextScreen);
  }, [screen, syncPreviousScreen]);

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

  useEffect(() => {
    if (!sessionLoaded) return;

    const timeout = window.setTimeout(() => {
      saveAnonymousSessionSettings(
        sessionId,
        createPrototypeSessionSettings({
          preferences: prefs,
          deadlines,
          selectedSources,
          onboarded,
        }),
      ).catch(error => {
        console.warn("Anonymous session settings could not be saved.", error);
      });
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [deadlines, onboarded, prefs, selectedSources, sessionId, sessionLoaded]);

  function openRecipe(mealId: string) {
    track("recipe_viewed", { meal_id: mealId, source_screen: screen });
    setSelectedMealId(mealId);
    navigateScreen("recipe-detail");
  }

  if (screen === "landing") {
    return <Landing onStart={() => navigateScreen("onboarding")} track={track} />;
  }

  if (screen === "onboarding") {
    return (
      <Onboarding
        setOnboarded={setOnboarded}
        setScreen={navigateScreen}
        prefs={prefs}
        setPrefs={setPrefs}
        deadlines={deadlines}
        setDeadlines={setDeadlines}
        selectedSources={selectedSources}
        setSelectedSources={setSelectedSources}
        calendarProvider={calendarProvider}
        setCalendarProvider={setCalendarProvider}
        track={track}
      />
    );
  }

  return (
    <Shell screen={screen} setScreen={navigateScreen} previousScreen={previousScreen} onBack={navigateBack} onboarded={onboarded} track={track}>
      {screen === "dashboard" && <Dashboard prefs={prefs} plan={plan} customRecipes={customRecipes} setScreen={navigateScreen} onSelectMeal={openRecipe} track={track} />}
      {screen === "calendar" && <CalendarScreen deadlines={deadlines} setDeadlines={setDeadlines} setScreen={navigateScreen} track={track} />}
      {screen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} setScreen={navigateScreen} onSelectMeal={openRecipe} track={track} />}
      {screen === "discover" && <DiscoverScreen prefs={prefs} customRecipes={customRecipes} plan={plan} setPlan={setPlan} saved={discoverSaved} setSaved={setDiscoverSaved} rejected={discoverRejected} setRejected={setDiscoverRejected} onSelectMeal={openRecipe} track={track} />}
      {screen === "recipes" && <RecipesScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} onSelectMeal={openRecipe} track={track} />}
      {screen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={navigateScreen} calendarProvider={calendarProvider} setCalendarProvider={setCalendarProvider} setDeadlines={setDeadlines} track={track} />}
      {screen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} setScreen={navigateScreen} track={track} />}
    </Shell>
  );
}
