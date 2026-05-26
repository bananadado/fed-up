import { useState } from "react";

import { defaultDeadlines, initialPlan, initialPreferences } from "./data";
import type { Deadline, Meal, PlanEntry, Preferences, Screen } from "./types";
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

export function DeadlineFoodPrototype() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [onboarded, setOnboarded] = useState(false);
  const [deadlines, setDeadlines] = useState<Deadline[]>(defaultDeadlines);
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const [selectedSources, setSelectedSources] = useState(["budget", "bbc", "own", "campus"]);
  const [plan, setPlan] = useState<PlanEntry[]>(initialPlan);
  const [customRecipes, setCustomRecipes] = useState<Meal[]>([]);
  const [selectedMealId, setSelectedMealId] = useState(initialPlan[0]?.meals[0]?.mealId ?? "m1");

  function openRecipe(mealId: string) {
    setSelectedMealId(mealId);
    setScreen("recipe-detail");
  }

  if (screen === "landing") {
    return <Landing onStart={() => setScreen("onboarding")} />;
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
      />
    );
  }

  return (
    <Shell screen={screen} setScreen={setScreen} onboarded={onboarded}>
      {screen === "dashboard" && <Dashboard prefs={prefs} plan={plan} customRecipes={customRecipes} setScreen={setScreen} onSelectMeal={openRecipe} />}
      {screen === "calendar" && <CalendarScreen deadlines={deadlines} setScreen={setScreen} />}
      {screen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} setScreen={setScreen} onSelectMeal={openRecipe} />}
      {screen === "discover" && <DiscoverScreen prefs={prefs} customRecipes={customRecipes} plan={plan} setPlan={setPlan} onSelectMeal={openRecipe} />}
      {screen === "recipes" && <RecipesScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} onSelectMeal={openRecipe} />}
      {screen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={setScreen} />}
      {screen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} setScreen={setScreen} />}
    </Shell>
  );
}
