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
import { createPrototypeSessionSettings, normalizePreferences, restorePrototypePlan, type CalendarToken, type IcsSubscription } from "./sessionPersistence";
import { syncRecommenderUser } from "./recommenderApi";
import { computePlanSignature, generateAutoPlan } from "./autoPlanApi";
import {
  completeDeadlineFoodEmailLinkSignIn,
  linkDeadlineFoodAccount,
  onDeadlineFoodAccountChanged,
  sendDeadlineFoodEmailMagicLink,
  signInExistingDeadlineFoodAccount,
  switchToAnonymousAccountOnThisDevice,
  type AccountMessageTone,
  type EmailMagicLinkOptions,
  type AccountProviderId,
  type AccountSummary,
} from "./accountAuth";
import { fetchRecipeCatalogue, setRecipeCatalogue } from "./recipeCatalogue";
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
  const [accountBusy, setAccountBusy] = useState<AccountProviderId | "email" | "anonymous" | null>(null);
  // Set an account-area notice with a tone so the UI styles errors distinctly
  // from success/info. Clear with notifyAccount("").
  const notifyAccount = useCallback((text: string, tone: AccountMessageTone = "info") => {
    setAccountMessage(text);
    setAccountMessageTone(tone);
  }, []);
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? "landing");
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
  const syncPreviousScreen = useCallback(() => {
    setPreviousScreen(routeHistory.current.at(-1) ?? null);
  }, []);

  const enableSessionPersistence = useCallback(() => {
    setCanPersistSession(true);
  }, []);

  const navigateScreen = useCallback((nextScreen: Screen) => {
    if (screen === nextScreen) return;
    if (nextScreen !== "recipes") setDiscoverContext(null);
    enableSessionPersistence();
    routeHistory.current = [...routeHistory.current, screen].slice(-20);
    syncPreviousScreen();
    pendingHashScreen.current = nextScreen;
    window.location.hash = `/${nextScreen}`;
    setScreen(nextScreen);
  }, [enableSessionPersistence, screen, syncPreviousScreen]);

  useEffect(() => {
    let cancelled = false;

    fetchRecipeCatalogue()
      .then((recipes) => {
        if (!cancelled) {
          setRecipeCatalogue(recipes);
          setCatalogueVersion((version) => version + 1);
        }
      })
      .catch((error) => {
        console.warn("Recipe catalogue could not be loaded; using bundled seeds.", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        notifyAccount("Welcome back — your saved plan is synced to this account.");
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
          setPlan(restorePrototypePlan(snapshot.settings.plan, initialPlan));
          if (snapshot.settings.planSignature) setPlanSignature(snapshot.settings.planSignature);
          if (snapshot.settings.planGeneratedAt) setPlanGeneratedAt(snapshot.settings.planGeneratedAt);
          if (snapshot.settings.calendarSkipped) setCalendarSkipped(snapshot.settings.calendarSkipped);
        } else if (screenFromHash() === "onboarding") {
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
    planGeneratedAt?: string;
    planSignature?: string;
    calendarSkipped?: boolean;
  } = {}) => createPrototypeSessionSettings({
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
  useEffect(() => {
    if (!sessionLoaded || !onboarded || planGenerating) return;
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
  }, [sessionLoaded, onboarded, planGenerating, planGeneratedAt, planStale, prefs.planRegenMode, currentPlanSignature, regeneratePlan]);

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

  if (!sessionLoaded || (onboarded && onboardingScreens.has(screen)) || (!onboarded && isAppScreen(screen))) {
    return <LoadingScreen />;
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
      />
    );
  }

  return (
    <Shell screen={activeScreen} setScreen={navigateScreen} previousScreen={previousScreen} onBack={navigateBack} onboarded={onboarded} track={track}>
      {activeScreen === "dashboard" && <Dashboard prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} discoverSaved={discoverSaved} setScreen={navigateScreen} onSelectMeal={openRecipe} planStale={planStale} planGenerated={planGeneratedAt !== undefined} regenerating={planGenerating} onRegenerate={regeneratePlan} openDiscover={openDiscover} track={track} calendarSkipped={calendarSkipped} />}
      {activeScreen === "calendar" && <CalendarScreen deadlines={deadlines} setDeadlines={setDeadlines} calendarEvents={calendarEvents} plan={plan} customRecipes={customRecipes} setScreen={navigateScreen} track={track} />}
      {activeScreen === "plan" && <PlanScreen prefs={prefs} plan={plan} setPlan={setPlan} customRecipes={customRecipes} discoverSaved={discoverSaved} setScreen={navigateScreen} onSelectMeal={openRecipe} planStale={planStale} planGenerated={planGeneratedAt !== undefined} regenerating={planGenerating} onRegenerate={regeneratePlan} regenMode={prefs.planRegenMode} openDiscover={openDiscover} track={track} />}
      {activeScreen === "recipes" && <RecipesHubScreen customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} discoverRejected={discoverRejected} setDiscoverRejected={setDiscoverRejected} discoverReviewedRecipeIds={discoverReviewedRecipeIds} setDiscoverReviewedRecipeIds={setDiscoverReviewedRecipeIds} discoverRecommendationState={discoverRecommendationState} setDiscoverRecommendationState={setDiscoverRecommendationState} prefs={prefs} deadlines={deadlines} sessionId={sessionId} onSelectMeal={openRecipe} onAddToPlan={openAddToPlan} discoverContext={discoverContext} track={track} />}
      {activeScreen === "settings" && <SettingsScreen prefs={prefs} setPrefs={setPrefs} setScreen={navigateScreen} calendarProvider={calendarProvider} setCalendarProvider={setCalendarProvider} setDeadlines={setDeadlines} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} icsSubscriptions={icsSubscriptions} setIcsSubscriptions={setIcsSubscriptions} calendarTokens={calendarTokens} setCalendarTokens={setCalendarTokens} sessionId={sessionId} account={account} accountMessage={accountMessage} accountMessageTone={accountMessageTone} accountBusy={accountBusy} onConnectAccount={connectAccount} onSendEmailMagicLink={sendEmailMagicLink} onUseAnonymousAccount={returnToAnonymousAccount} track={track} />}
      {activeScreen === "recipe-detail" && <RecipeDetailScreen key={selectedMealId} mealId={selectedMealId} customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} discoverSaved={discoverSaved} setDiscoverSaved={setDiscoverSaved} setScreen={navigateScreen} backTo={previousScreen} onSelectMeal={openRecipe} track={track} />}
    </Shell>
  );
}
