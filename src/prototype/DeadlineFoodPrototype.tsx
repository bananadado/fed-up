import { useCallback, useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";

import { capturePostHogEvent, registerPostHogContext, registerPostHogSession, type AnalyticsProperties } from "@/lib/posthog";
import { defaultDeadlines, initialPlan, initialPreferences } from "./data";
import type { Deadline, Meal, PlanEntry, Preferences, Screen } from "./types";
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
  const [screen, setScreen] = useState<Screen>("landing");
  const [onboarded, setOnboarded] = useState(false);
  const [deadlines, setDeadlines] = useState<Deadline[]>(defaultDeadlines);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [selectedSources, setSelectedSources] = useState(["budget", "bbc", "own", "campus"]);
  const [plan, setPlan] = useState<PlanEntry[]>(initialPlan);
  const [customRecipes, setCustomRecipes] = useState<Meal[]>([]);
  const [selectedMealId, setSelectedMealId] = useState(initialPlan[0]?.meals[0]?.mealId ?? "m1");

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
          setDeadlines(snapshot.settings.deadlines);
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
    setScreen("recipe-detail");
  }

  if (screen === "landing") {
    return <Landing onStart={() => setScreen(onboarded ? "dashboard" : "onboarding")} track={track} />;
  }

  if (!onboarded && screen === "onboarding") {
    return (
      <Onboarding
        setOnboarded={setOnboarded}
        setScreen={setScreen}
        prefs={prefs}
        setPrefs={setPrefs}
        deadlines={deadlines}
        setDeadlines={setDeadlines}
        selectedSources={selectedSources}
        setSelectedSources={setSelectedSources}
        track={track}
      />
    );
  }

  return (
    <Shell screen={screen} setScreen={setScreen} onboarded={onboarded} track={track}>
      {screen === "dashboard" && <Dashboard prefs={prefs} plan={plan} customRecipes={customRecipes} setScreen={setScreen} onSelectMeal={openRecipe} track={track} />}
      {screen === "calendar" && <CalendarScreen deadlines={deadlines} setScreen={setScreen} track={track} />}
      {screen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} setScreen={setScreen} onSelectMeal={openRecipe} track={track} />}
      {screen === "discover" && <DiscoverScreen prefs={prefs} customRecipes={customRecipes} plan={plan} setPlan={setPlan} onSelectMeal={openRecipe} track={track} />}
      {screen === "recipes" && <RecipesScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} onSelectMeal={openRecipe} track={track} />}
      {screen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={setScreen} track={track} />}
      {screen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} setScreen={setScreen} track={track} />}
    </Shell>
  );
}
