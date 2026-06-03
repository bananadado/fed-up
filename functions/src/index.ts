import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {randomUUID} from "crypto";
import {parseICSText} from "./icsParser";
import {
  calendarEventsToDeadlines,
  exchangeGoogleCode,
  exchangeOutlookCode,
  fetchGoogleEvents,
  fetchOutlookEvents,
  filterFutureEvents,
  refreshGoogleToken,
  refreshOutlookToken,
} from "./calendarUtils";
import {
  canonicalConstraints,
  deadlineBootstrap,
  prototypeMeta,
  prototypeRecipes,
  seededMeals,
} from "./generated/prototypeData";

initializeApp();
setGlobalOptions({region: "europe-west2", maxInstances: 10});

const firestore = getFirestore();
const prototypeRef = firestore.collection("prototypeData").doc("deadlineFood");
// Canonical recipe content lives in Firestore (issue #123). pgvector stores only
// the recipe UID as primary key plus its embedding; reviews are Firestore-only.
const recipesRef = firestore.collection("recipes");
const recipeReviewsRef = firestore.collection("recipeReviews");
const anonymousSessionsRef = firestore.collection("anonymousSessions");
const openFoodFactsCacheRef = firestore.collection("openFoodFactsNutritionCache");
const openFoodFactsRateLimitRef = firestore
  .collection("serviceRateLimits")
  .doc("openFoodFactsSearchV2");
const anonymousSessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;
const recipeIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const sessionRetentionDays = 90;
const sessionRetentionMs = sessionRetentionDays * 24 * 60 * 60 * 1000;
const prototypeSessionSettingsVersion = 2;
const publicHttpOptions = {cors: true, invoker: "public"} as const;
const nutritionHttpOptions = {
  ...publicHttpOptions,
  timeoutSeconds: 300,
} as const;
const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");
const microsoftClientId = defineSecret("MICROSOFT_CLIENT_ID");
const microsoftClientSecret = defineSecret("MICROSOFT_CLIENT_SECRET");
const recommenderApiUrl = defineSecret("RECOMMENDER_API_URL");
const recommenderApiKey = defineSecret("RECOMMENDER_API_KEY");
const googleOAuthHttpOptions = {
  ...publicHttpOptions,
  secrets: [googleClientId, googleClientSecret],
};
const microsoftOAuthHttpOptions = {
  ...publicHttpOptions,
  secrets: [microsoftClientId, microsoftClientSecret],
};
const calendarOAuthSecrets = [
  googleClientId,
  googleClientSecret,
  microsoftClientId,
  microsoftClientSecret,
];
const recommenderHttpOptions = {
  ...publicHttpOptions,
  secrets: [recommenderApiUrl, recommenderApiKey],
  timeoutSeconds: 60,
};
const openFoodFactsProductionBaseUrl = "https://world.openfoodfacts.org";
const openFoodFactsStagingBaseUrl = "https://world.openfoodfacts.net";
const openFoodFactsBaseUrl = (
  process.env.OPENFOODFACTS_BASE_URL ??
  (process.env.FUNCTIONS_EMULATOR === "true" ? openFoodFactsStagingBaseUrl : openFoodFactsProductionBaseUrl)
).replace(/\/$/, "");
const openFoodFactsUserAgent =
  process.env.OPENFOODFACTS_USER_AGENT ??
  "DeadlineFoodPrototype/0.1 Firebase Functions";
const storageBucket = "drp03-50059.firebasestorage.app";
const maxPhotoBytes = 5 * 1024 * 1024;
const allowedPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const openFoodFactsTimeoutMs = 6000;
const openFoodFactsMinRequestIntervalMs = 6500;
const openFoodFactsCacheTtlMs = 24 * 60 * 60 * 1000;
const openFoodFactsMissingCacheTtlMs = 60 * 60 * 1000;
const openFoodFactsLockTtlMs = 45 * 1000;

type PrototypeData = typeof deadlineBootstrap;
type UnknownRecord = Record<string, unknown>;

type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  preparation?: string;
};

type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: {
    provider: "OpenFoodFacts";
    label: string;
    fetchedAt: string;
    matchedIngredients: {
      ingredient: string;
      productName: string;
      grams: number;
    }[];
    missingIngredients: string[];
  };
};

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    energy_100g?: number;
    energy_unit?: string;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
};

type IngredientNutritionEstimate = {
  ingredient: RecipeIngredient;
  productName: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type OpenFoodFactsSearchResponse = {
  products?: OpenFoodFactsProduct[];
};

type HttpRequest = {
  method: string;
  query: Record<string, unknown>;
  body: unknown;
};

type HttpResponse = {
  set(name: string, value: string): HttpResponse;
  status(code: number): HttpResponse;
  json(body: unknown): void;
  send(body: string): void;
};

type IcsSubscription = {
  url: string;
  source: string;
  addedAt: string;
};

type CalendarToken = {
  provider: "google" | "outlook";
  refreshToken: string;
  expiresAt: string;
  addedAt: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: string;
  source: string;
  importedAt: string;
};

type PrototypeSessionSettings = {
  settingsVersion: typeof prototypeSessionSettingsVersion;
  preferences: {
    maxTime: number | null;
    budget: number;
    kitchen: string;
    cookingAbility: string;
    postcode: string;
    university: string;
    dietary: string[];
    allergens: string[];
    dislikes: string[];
    likes: string[];
    availableIngredients: RecipeIngredient[];
  };
  deadlines: {
    id: string;
    title: string;
    date: string;
    time: string;
    intensity: string;
    eventType: "academic" | "general";
    effortHours: number;
    urgency: string;
    rawDate?: string;
    confirmed?: boolean;
  }[];
  selectedSources: string[];
  onboarded: boolean;
  customRecipes: UnknownRecord[];
  discoverSaved: UnknownRecord[];
  discoverRejected: UnknownRecord[];
  discoverReviewedRecipeIds: string[];
  plan: UnknownRecord[];
  calendarEvents: CalendarEvent[];
  icsSubscriptions: IcsSubscription[];
  calendarTokens: CalendarToken[];
};

const servingGrams: Record<string, number> = {
  "banana": 120,
  "bread": 80,
  "egg": 50,
  "eggs": 50,
  "flatbread": 70,
  "jacket potato": 250,
  "microwave rice": 250,
  "rice portion": 180,
  "tortilla wrap": 60,
  "wrap": 60,
};

const cookingAdjectives = new Set([
  "baby", "canned", "chopped", "cooked", "diced", "dried", "frozen", "grated",
  "large", "medium", "minced", "organic", "raw", "sliced", "small", "tinned", "whole",
]);

const irregularCategoryTerms: Record<string, string[]> = {
  berry: ["berries"],
  berries: ["berries"],
  courgette: ["courgettes", "zucchini"],
  egg: ["eggs"],
  pepper: ["peppers"],
  potato: ["potatoes"],
  tomato: ["tomatoes"],
};

async function seedPrototypeData(): Promise<PrototypeData> {
  await prototypeRef.set(
    {
      ...deadlineBootstrap,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return deadlineBootstrap;
}

async function getPrototypeData(): Promise<PrototypeData> {
  const snapshot = await prototypeRef.get();

  if (!snapshot.exists) {
    return seedPrototypeData();
  }

  const data = snapshot.data();

  return {
    meals: Array.isArray(data?.meals) ? data.meals : seededMeals,
    canonicalConstraints:
      typeof data?.canonicalConstraints === "object" ?
        data.canonicalConstraints :
        canonicalConstraints,
    prototype:
      typeof data?.prototype === "object" ? data.prototype : prototypeMeta,
  } as PrototypeData;
}

function rejectUnsupportedMethod(request: HttpRequest, response: HttpResponse): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.set("Allow", "GET, HEAD, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

function rejectUnsupportedReviewMethod(request: HttpRequest, response: HttpResponse): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
    response.set("Allow", "GET, HEAD, POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

// ── Canonical recipe store (Firestore) ──────────────────────────────────────
// Recipe content is owned by Firestore; pgvector holds only the UID + embedding.

async function ensureRecipesSeeded(): Promise<void> {
  const existing = await recipesRef.limit(1).get();
  if (!existing.empty) return;

  const batch = firestore.batch();
  for (const recipe of prototypeRecipes) {
    batch.set(recipesRef.doc(recipe.id), {
      ...recipe,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

async function listRecipes(): Promise<UnknownRecord[]> {
  await ensureRecipesSeeded();
  const snapshot = await recipesRef.get();
  return snapshot.docs.map((doc) => doc.data() as UnknownRecord);
}

// Map a canonical prototype recipe (Firestore shape) to the recommender's
// RecipeIn payload so pgvector can embed it keyed by the recipe UID.
function toRecommenderRecipePayload(recipe: UnknownRecord): UnknownRecord {
  const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const str = (value: unknown): string => (typeof value === "string" ? value : "");
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const nutrition = asRecord(recipe.nutrition) ?? {};

  return {
    id: recipe.id,
    name: str(recipe.name),
    meal_type: str(recipe.type) || "cook",
    meal_slots: list(recipe.mealSlots),
    price_pence: Math.round(num(recipe.price) * 100),
    prep_minutes: num(recipe.time),
    dietary_tags: [],
    allergens: list(recipe.allergens),
    suitability_tags: list(recipe.tags),
    ingredients: list(recipe.ingredients),
    instructions: list(recipe.instructions),
    nutrition: {
      calories: num(nutrition.calories),
      protein: num(nutrition.protein),
      carbs: num(nutrition.carbs),
      fat: num(nutrition.fat),
    },
    source: str(recipe.source) || null,
    note: str(recipe.note) || null,
  };
}

type StoredReview = {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
};

function sanitizeReviewInput(
  value: UnknownRecord | null,
): {author: string; rating: number; comment: string} | null {
  if (!value) return null;

  const comment = typeof value.comment === "string" ? value.comment.trim() : "";
  if (!comment) return null;

  const author =
    typeof value.author === "string" && value.author.trim() ?
      value.author.trim().slice(0, 60) :
      "Anonymous";
  const ratingRaw = typeof value.rating === "number" ? value.rating : Number(value.rating);
  const rating = Number.isFinite(ratingRaw) ?
    Math.min(5, Math.max(1, Math.round(ratingRaw))) :
    5;

  return {author, rating, comment: comment.slice(0, 2000)};
}

function averageRating(reviews: StoredReview[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
}

async function readRecipeReviews(recipeId: string): Promise<StoredReview[]> {
  const snapshot = await recipeReviewsRef.doc(recipeId).get();
  const data = snapshot.data();
  return Array.isArray(data?.reviews) ? (data?.reviews as StoredReview[]) : [];
}

async function appendRecipeReview(
  recipeId: string,
  review: {author: string; rating: number; comment: string},
): Promise<StoredReview[]> {
  const docRef = recipeReviewsRef.doc(recipeId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const data = snapshot.data();
    const existing = Array.isArray(data?.reviews) ? (data?.reviews as StoredReview[]) : [];
    const stored: StoredReview = {
      id: randomUUID(),
      author: review.author,
      rating: review.rating,
      comment: review.comment,
      date: new Date().toISOString(),
    };
    const next = [stored, ...existing].slice(0, 200);
    transaction.set(
      docRef,
      {reviews: next, updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    return next;
  });
}

function rejectUnsupportedSessionMethod(
  request: HttpRequest,
  response: HttpResponse,
): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "PUT" &&
    request.method !== "POST"
  ) {
    response.set("Allow", "GET, HEAD, PUT, POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

function sendJson(response: HttpResponse, body: unknown): void {
  response.set("Cache-Control", "public, max-age=60, s-maxage=300");
  response.status(200).json(body);
}

function sendError(response: HttpResponse, error: unknown): void {
  logger.error("Deadline food function failed", error);
  response.status(500).json({error: "Prototype data could not be loaded"});
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function boundedString(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function boundedStringList(
  value: unknown,
  maxItems = 20,
  maxLength = 80,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeRecipeList(value: unknown, maxItems = 100): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is UnknownRecord => asRecord(item) !== null).slice(0, maxItems);
}

function normalizeDeadline(value: unknown): PrototypeSessionSettings["deadlines"][number] | null {
  const deadline = asRecord(value);

  if (deadline === null) {
    return null;
  }

  return {
    id: boundedString(deadline.id, randomUUID(), 80),
    title: boundedString(deadline.title, "Untitled deadline"),
    date: boundedString(deadline.date, ""),
    time: boundedString(deadline.time, ""),
    intensity: boundedString(deadline.intensity, "Medium", 40),
    eventType: deadline.eventType === "academic" ? "academic" : "general",
    effortHours: boundedNumber(deadline.effortHours, 3, 0, 12),
    urgency: ["low", "medium", "high"].includes(String(deadline.urgency)) ?
      String(deadline.urgency) :
      "medium",
    ...(typeof deadline.rawDate === "string" ? {rawDate: boundedString(deadline.rawDate, "", 10)} : {}),
    ...(typeof deadline.confirmed === "boolean" ? {confirmed: deadline.confirmed} : {}),
  };
}

function normalizeIcsSubscription(value: unknown): IcsSubscription | null {
  const sub = asRecord(value);
  if (sub === null) return null;

  const url = boundedString(sub.url, "", 2048);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return {
    url,
    source: boundedString(sub.source, "other", 20),
    addedAt: boundedString(sub.addedAt, new Date().toISOString(), 40),
  };
}

function normalizeCalendarToken(value: unknown): CalendarToken | null {
  const token = asRecord(value);
  if (token === null) return null;

  const provider = String(token.provider);
  if (provider !== "google" && provider !== "outlook") return null;

  const refreshToken = boundedString(token.refreshToken, "", 4096);
  if (!refreshToken) return null;

  return {
    provider,
    refreshToken,
    expiresAt: boundedString(token.expiresAt, "", 40),
    addedAt: boundedString(token.addedAt, new Date().toISOString(), 40),
  };
}

function normalizeCalendarEvent(value: unknown): CalendarEvent | null {
  const event = asRecord(value);
  if (event === null) return null;

  const id = boundedString(event.id, "", 200);
  const title = boundedString(event.title, "", 500);
  if (!id || !title) return null;

  return {
    id,
    title,
    description: boundedString(event.description, "", 2000),
    location: boundedString(event.location, "", 500),
    start: boundedString(event.start, "", 40),
    end: boundedString(event.end, "", 40),
    allDay: event.allDay === true,
    recurrence: boundedString(event.recurrence, "", 500),
    source: boundedString(event.source, "other", 20),
    importedAt: boundedString(event.importedAt, "", 40),
  };
}

function normalizeRecipeIngredient(value: unknown): RecipeIngredient | null {
  if (typeof value === "string") {
    const name = boundedString(value, "", 120);
    return name ? {name, quantity: 1, unit: "serving"} : null;
  }

  const ingredient = asRecord(value);

  if (ingredient === null) {
    return null;
  }

  const name = boundedString(ingredient.name, "", 120);
  const unit = boundedString(ingredient.unit, "serving", 40);
  const preparation = boundedString(ingredient.preparation, "", 80);

  if (!name || !unit) {
    return null;
  }

  return {
    name,
    quantity: boundedNumber(ingredient.quantity, 1, 0.1, 5000),
    unit,
    ...(preparation ? {preparation} : {}),
  };
}

function normalizeRecipeIngredientList(value: unknown, maxItems = 30): RecipeIngredient[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeRecipeIngredient)
    .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null)
    .slice(0, maxItems);
}

function normalizePrototypeSessionSettings(value: unknown): PrototypeSessionSettings {
  const settings = asRecord(value);

  if (settings === null) {
    throw new Error("Session settings must be an object.");
  }

  if (settings.settingsVersion !== 1 && settings.settingsVersion !== prototypeSessionSettingsVersion) {
    throw new Error("Unsupported session settings version.");
  }

  const preferences = asRecord(settings.preferences);

  if (preferences === null) {
    throw new Error("Session preferences must be an object.");
  }

  return {
    settingsVersion: prototypeSessionSettingsVersion,
    preferences: {
      maxTime:
        preferences.maxTime === null ?
          null :
          boundedNumber(preferences.maxTime, 20, 1, 240),
      budget: boundedNumber(preferences.budget, 48, 0, 1000),
      kitchen: boundedString(preferences.kitchen, "full", 80),
      cookingAbility: boundedString(preferences.cookingAbility, "", 40),
      postcode: boundedString(preferences.postcode, "", 24),
      university: boundedString(preferences.university, "", 160),
      dietary: boundedStringList(preferences.dietary),
      allergens: boundedStringList(preferences.allergens),
      dislikes: boundedStringList(preferences.dislikes),
      likes: boundedStringList(preferences.likes),
      availableIngredients: normalizeRecipeIngredientList(preferences.availableIngredients),
    },
    deadlines: Array.isArray(settings.deadlines) ?
      settings.deadlines
        .map(normalizeDeadline)
        .filter((deadline): deadline is NonNullable<typeof deadline> => deadline !== null)
        .slice(0, 20) :
      [],
    selectedSources: boundedStringList(settings.selectedSources),
    onboarded: settings.onboarded === true,
    customRecipes: normalizeRecipeList(settings.customRecipes),
    discoverSaved: normalizeRecipeList(settings.discoverSaved),
    discoverRejected: normalizeRecipeList(settings.discoverRejected, 3),
    discoverReviewedRecipeIds: boundedStringList(settings.discoverReviewedRecipeIds, 250, 120),
    plan: normalizeRecipeList(settings.plan, 30),
    calendarEvents: Array.isArray(settings.calendarEvents) ?
      settings.calendarEvents
        .map(normalizeCalendarEvent)
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .slice(0, 250) :
      [],
    icsSubscriptions: Array.isArray(settings.icsSubscriptions) ?
      settings.icsSubscriptions
        .map(normalizeIcsSubscription)
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .slice(0, 5) :
      [],
    calendarTokens: Array.isArray(settings.calendarTokens) ?
      settings.calendarTokens
        .map(normalizeCalendarToken)
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .slice(0, 5) :
      [],
  };
}

function sessionExpiryTimestamp(): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() + sessionRetentionMs));
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}

function readRequestBody(request: HttpRequest): UnknownRecord | null {
  if (typeof request.body === "string") {
    try {
      return asRecord(JSON.parse(request.body));
    } catch (_error) {
      return null;
    }
  }

  return asRecord(request.body);
}

function rejectUnsupportedRecommenderMethod(
  request: HttpRequest,
  response: HttpResponse,
): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (request.method !== "POST") {
    response.set("Allow", "POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

async function proxyRecommenderRequest(
  request: HttpRequest,
  response: HttpResponse,
  path: string,
  payloadOverride?: unknown,
): Promise<void> {
  if (rejectUnsupportedRecommenderMethod(request, response)) return;

  try {
    const url = new URL(path, recommenderApiUrl.value().replace(/\/$/, ""));
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Deadline-Food-API-Key": recommenderApiKey.value(),
      },
      body: JSON.stringify(payloadOverride ?? request.body ?? {}),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await upstream.text();

    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    response.status(upstream.status).send(body);
  } catch (error) {
    logger.error("Recommender API request failed", {path, error});
    response.status(502).json({error: "Recommender API could not be reached"});
  }
}

async function enrichRecommendedRecipes(body: unknown): Promise<unknown> {
  if (!Array.isArray(body)) {
    return body;
  }

  const recipeIds = body
    .map((item) => {
      const scoredRecipe = asRecord(item);
      const recipe = asRecord(scoredRecipe?.recipe);
      return typeof recipe?.id === "string" && recipeIdPattern.test(recipe.id) ? recipe.id : null;
    })
    .filter((id): id is string => id !== null);

  if (recipeIds.length === 0) {
    return body;
  }

  const uniqueIds = [...new Set(recipeIds)];
  const snapshots = await firestore.getAll(...uniqueIds.map((id) => recipesRef.doc(id)));
  const photosByRecipeId = new Map<string, string>();

  snapshots.forEach((snapshot) => {
    const photoUrl = snapshot.data()?.photoUrl;
    if (snapshot.exists && typeof photoUrl === "string" && photoUrl.trim()) {
      photosByRecipeId.set(snapshot.id, photoUrl);
    }
  });

  return body.map((item) => {
    const scoredRecipe = asRecord(item);
    const recipe = asRecord(scoredRecipe?.recipe);
    const recipeId = typeof recipe?.id === "string" ? recipe.id : "";
    const photoUrl = photosByRecipeId.get(recipeId);

    if (!scoredRecipe || !recipe || !photoUrl) {
      return item;
    }

    return {
      ...scoredRecipe,
      recipe: {
        ...recipe,
        photoUrl,
      },
    };
  });
}

async function proxyRecommenderRecommendations(
  request: HttpRequest,
  response: HttpResponse,
): Promise<void> {
  if (rejectUnsupportedRecommenderMethod(request, response)) return;

  try {
    const url = new URL("/recommend", recommenderApiUrl.value().replace(/\/$/, ""));
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Deadline-Food-API-Key": recommenderApiKey.value(),
      },
      body: JSON.stringify(request.body ?? {}),
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const bodyText = await upstream.text();

    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Content-Type", contentType);

    if (!upstream.ok || !contentType.includes("application/json")) {
      response.status(upstream.status).send(bodyText);
      return;
    }

    const body = JSON.parse(bodyText) as unknown;
    let responseBody = body;

    try {
      responseBody = await enrichRecommendedRecipes(body);
    } catch (error) {
      logger.error("Recommendation recipe enrichment failed", {error});
    }

    response.status(upstream.status).json(responseBody);
  } catch (error) {
    logger.error("Recommender recommendations request failed", {error});
    response.status(502).json({error: "Recommender API could not be reached"});
  }
}

function rejectUnsupportedNutritionMethod(
  request: HttpRequest,
  response: HttpResponse,
): boolean {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return true;
  }

  if (request.method !== "POST") {
    response.set("Allow", "POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return true;
  }

  return false;
}

function isRecipeIngredient(value: unknown): value is RecipeIngredient {
  const candidate = value as RecipeIngredient;

  return (
    typeof candidate?.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.quantity === "number" &&
    Number.isFinite(candidate.quantity) &&
    candidate.quantity > 0 &&
    typeof candidate.unit === "string" &&
    candidate.unit.trim().length > 0
  );
}

function normalizeIngredientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function openFoodFactsCacheDocId(cacheKey: string): string {
  return Buffer.from(cacheKey).toString("base64url");
}

function toCategoryTag(term: string): string {
  return normalizeIngredientKey(term)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map(toCategoryTag).filter(Boolean))];
}

function openFoodFactsCategoryTerms(ingredient: RecipeIngredient): string[] {
  const name = normalizeIngredientKey(ingredient.name);
  const terms = [name, ...(irregularCategoryTerms[name] ?? [])];
  const words = name.split(" ");

  if (words.length > 1 && words[0] && cookingAdjectives.has(words[0])) {
    const stripped = words.slice(1).join(" ");
    terms.push(stripped, ...(irregularCategoryTerms[stripped] ?? []));
  }

  if (words.length > 1 && words[0] && words[0].length > 2) {
    terms.push(words[0], ...(irregularCategoryTerms[words[0]] ?? []));
  }

  return uniqueTerms(terms);
}

function gramsForIngredient(ingredient: RecipeIngredient): number {
  switch (ingredient.unit) {
  case "g":
    return ingredient.quantity;
  case "kg":
    return ingredient.quantity * 1000;
  case "ml":
    return ingredient.quantity;
  case "l":
    return ingredient.quantity * 1000;
  case "tsp":
    return ingredient.quantity * 5;
  case "tbsp":
    return ingredient.quantity * 15;
  case "cup":
    return ingredient.quantity * 240;
  case "can":
    return ingredient.quantity * 400;
  default:
    return ingredient.quantity * (servingGrams[ingredient.name.toLowerCase()] ?? 100);
  }
}

function estimateIngredientNutrition(
  ingredient: RecipeIngredient,
  product: OpenFoodFactsProduct,
): IngredientNutritionEstimate | null {
  const nutriments = product.nutriments;
  const grams = gramsForIngredient(ingredient);
  const caloriesPer100g =
    typeof nutriments?.["energy-kcal_100g"] === "number" ?
      nutriments["energy-kcal_100g"] :
      nutriments?.energy_unit === "kJ" && typeof nutriments.energy_100g === "number" ?
        nutriments.energy_100g / 4.184 :
        null;

  if (
    caloriesPer100g === null ||
    typeof nutriments?.proteins_100g !== "number" ||
    typeof nutriments.carbohydrates_100g !== "number" ||
    typeof nutriments.fat_100g !== "number"
  ) {
    return null;
  }

  const multiplier = grams / 100;

  return {
    ingredient,
    productName: product.product_name?.trim() || ingredient.name,
    grams,
    calories: caloriesPer100g * multiplier,
    protein: nutriments.proteins_100g * multiplier,
    carbs: nutriments.carbohydrates_100g * multiplier,
    fat: nutriments.fat_100g * multiplier,
  };
}

function roundMacro(value: number): number {
  return Math.max(0, Math.round(value));
}

function totalNutritionFromEstimates(
  estimates: IngredientNutritionEstimate[],
  missingIngredients: string[],
): Nutrition {
  return {
    calories: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.calories, 0)),
    protein: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.protein, 0)),
    carbs: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.carbs, 0)),
    fat: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.fat, 0)),
    source: {
      provider: "OpenFoodFacts",
      label: "OpenFoodFacts estimate",
      fetchedAt: new Date().toISOString(),
      matchedIngredients: estimates.map((estimate) => ({
        ingredient: estimate.ingredient.name,
        productName: estimate.productName,
        grams: roundMacro(estimate.grams),
      })),
      missingIngredients,
    },
  };
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return null;
}

function parseCachedProduct(value: unknown): OpenFoodFactsProduct | null | undefined {
  if (value === null) {
    return null;
  }

  const product = asRecord(value);

  if (product === null) {
    return undefined;
  }

  const nutriments = asRecord(product.nutriments);

  return {
    code: typeof product.code === "string" ? product.code : undefined,
    product_name: typeof product.product_name === "string" ? product.product_name : undefined,
    nutriments: nutriments === null ? undefined : {
      "energy-kcal_100g":
        typeof nutriments["energy-kcal_100g"] === "number" ?
          nutriments["energy-kcal_100g"] :
          undefined,
      "energy_100g": typeof nutriments.energy_100g === "number" ? nutriments.energy_100g : undefined,
      "energy_unit": typeof nutriments.energy_unit === "string" ? nutriments.energy_unit : undefined,
      "proteins_100g":
        typeof nutriments.proteins_100g === "number" ? nutriments.proteins_100g : undefined,
      "carbohydrates_100g":
        typeof nutriments.carbohydrates_100g === "number" ?
          nutriments.carbohydrates_100g :
          undefined,
      "fat_100g": typeof nutriments.fat_100g === "number" ? nutriments.fat_100g : undefined,
    },
  };
}

function compactOpenFoodFactsProduct(product: OpenFoodFactsProduct): OpenFoodFactsProduct {
  return {
    ...(product.code ? {code: product.code} : {}),
    ...(product.product_name ? {product_name: product.product_name} : {}),
    nutriments: {
      ...(typeof product.nutriments?.["energy-kcal_100g"] === "number" ?
        {"energy-kcal_100g": product.nutriments["energy-kcal_100g"]} :
        {}),
      ...(typeof product.nutriments?.energy_100g === "number" ?
        {energy_100g: product.nutriments.energy_100g} :
        {}),
      ...(product.nutriments?.energy_unit ? {energy_unit: product.nutriments.energy_unit} : {}),
      ...(typeof product.nutriments?.proteins_100g === "number" ?
        {proteins_100g: product.nutriments.proteins_100g} :
        {}),
      ...(typeof product.nutriments?.carbohydrates_100g === "number" ?
        {carbohydrates_100g: product.nutriments.carbohydrates_100g} :
        {}),
      ...(typeof product.nutriments?.fat_100g === "number" ?
        {fat_100g: product.nutriments.fat_100g} :
        {}),
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function waitForOpenFoodFactsTurn(): Promise<void> {
  const waitMs = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(openFoodFactsRateLimitRef);
    const currentTime = Date.now();
    const nextRequestAt = timestampMillis(snapshot.data()?.nextRequestAt) ?? currentTime;
    const scheduledAt = Math.max(currentTime, nextRequestAt);

    transaction.set(
      openFoodFactsRateLimitRef,
      {
        nextRequestAt: Timestamp.fromMillis(scheduledAt + openFoodFactsMinRequestIntervalMs),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return scheduledAt - currentTime;
  });

  await sleep(waitMs);
}

async function fetchOpenFoodFactsProducts(categoryTag: string): Promise<OpenFoodFactsProduct[]> {
  const url = new URL("/api/v2/search", openFoodFactsBaseUrl);
  url.searchParams.set("categories_tags_en", categoryTag);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "5");
  url.searchParams.set("sort_by", "popularity_key");
  url.searchParams.set("fields", "code,product_name,nutriments");

  await waitForOpenFoodFactsTurn();

  const response = await fetch(url, {
    headers: {"Accept": "application/json", "User-Agent": openFoodFactsUserAgent},
    signal: AbortSignal.timeout(openFoodFactsTimeoutMs),
  }).catch(() => null);

  if (!response?.ok) {
    logger.warn("OpenFoodFacts v2 search failed", {
      status: response?.status,
      categoryTag,
    });
    return [];
  }

  const payload = await response.json().catch(() => null) as OpenFoodFactsSearchResponse | null;
  return payload?.products ?? [];
}

async function fetchOpenFoodFactsProductForIngredient(
  ingredient: RecipeIngredient,
): Promise<OpenFoodFactsProduct | null> {
  for (const categoryTag of openFoodFactsCategoryTerms(ingredient)) {
    const products = await fetchOpenFoodFactsProducts(categoryTag);
    const match = products.find((product) => estimateIngredientNutrition(ingredient, product) !== null);

    if (match) {
      return compactOpenFoodFactsProduct(match);
    }
  }

  return null;
}

async function tryAcquireOpenFoodFactsCacheLock(
  cacheKey: string,
): Promise<boolean> {
  const docRef = openFoodFactsCacheRef.doc(openFoodFactsCacheDocId(cacheKey));

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const data = snapshot.data();
    const currentTime = Date.now();
    const expiresAt = timestampMillis(data?.expiresAt);
    const lockedUntil = timestampMillis(data?.lockedUntil);

    if (expiresAt !== null && expiresAt > currentTime) {
      return false;
    }

    if (lockedUntil !== null && lockedUntil > currentTime) {
      return false;
    }

    transaction.set(
      docRef,
      {
        cacheKey,
        lockedUntil: Timestamp.fromMillis(currentTime + openFoodFactsLockTtlMs),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return true;
  });
}

async function readOpenFoodFactsCachedProduct(
  cacheKey: string,
  allowStale: boolean,
): Promise<OpenFoodFactsProduct | null | undefined> {
  const snapshot = await openFoodFactsCacheRef.doc(openFoodFactsCacheDocId(cacheKey)).get();

  if (!snapshot.exists) {
    return undefined;
  }

  const data = snapshot.data();
  const product = parseCachedProduct(data?.product);

  if (product === undefined) {
    return undefined;
  }

  const expiresAt = timestampMillis(data?.expiresAt);

  if (allowStale || (expiresAt !== null && expiresAt > Date.now())) {
    return product;
  }

  return undefined;
}

async function cacheOpenFoodFactsProduct(
  cacheKey: string,
  product: OpenFoodFactsProduct | null,
): Promise<void> {
  const ttlMs = product === null ? openFoodFactsMissingCacheTtlMs : openFoodFactsCacheTtlMs;

  await openFoodFactsCacheRef.doc(openFoodFactsCacheDocId(cacheKey)).set(
    {
      cacheKey,
      product,
      expiresAt: Timestamp.fromMillis(Date.now() + ttlMs),
      lockedUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

async function findOpenFoodFactsProductForIngredient(
  ingredient: RecipeIngredient,
): Promise<OpenFoodFactsProduct | null> {
  const cacheKey = normalizeIngredientKey(ingredient.name);
  const cachedProduct = await readOpenFoodFactsCachedProduct(cacheKey, false);

  if (cachedProduct !== undefined) {
    return cachedProduct;
  }

  const acquiredLock = await tryAcquireOpenFoodFactsCacheLock(cacheKey);

  if (!acquiredLock) {
    await sleep(750);
    return (await readOpenFoodFactsCachedProduct(cacheKey, true)) ?? null;
  }

  try {
    const product = await fetchOpenFoodFactsProductForIngredient(ingredient);
    await cacheOpenFoodFactsProduct(cacheKey, product);
    return product;
  } catch (error) {
    logger.error("OpenFoodFacts lookup failed", {cacheKey, error});
    await openFoodFactsCacheRef.doc(openFoodFactsCacheDocId(cacheKey)).set(
      {
        lockedUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    return (await readOpenFoodFactsCachedProduct(cacheKey, true)) ?? null;
  }
}

function sendSessionJson(
  response: HttpResponse,
  sessionId: string,
  settings: PrototypeSessionSettings | null,
  expiresAt: Timestamp | string | null,
): void {
  response.status(200).json({
    sessionId,
    settings,
    retentionDays: sessionRetentionDays,
    expiresAt: typeof expiresAt === "string" ? expiresAt : timestampToIso(expiresAt),
  });
}

export const deadlineFoodBootstrap = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    sendJson(response, await getPrototypeData());
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodMeals = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    const data = await getPrototypeData();
    sendJson(response, data.meals);
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodScenario = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    const data = await getPrototypeData();
    sendJson(response, data.canonicalConstraints);
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodRecommenderUser = onRequest(recommenderHttpOptions, async (request, response) => {
  await proxyRecommenderRequest(request, response, "/users");
});

export const deadlineFoodRecipes = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    sendJson(response, await listRecipes());
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodRecipeReviews = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedReviewMethod(request, response)) return;

  try {
    if (request.method === "POST") {
      const body = asRecord(request.body);
      const recipeId = typeof body?.recipeId === "string" ? body.recipeId : null;
      if (!recipeId || !recipeIdPattern.test(recipeId)) {
        response.status(400).json({error: "A valid recipeId is required"});
        return;
      }
      const review = sanitizeReviewInput(asRecord(body?.review));
      if (!review) {
        response.status(400).json({error: "A review comment is required"});
        return;
      }
      const reviews = await appendRecipeReview(recipeId, review);
      response.set("Cache-Control", "private, max-age=0, no-store");
      response.status(200).json({reviews, rating: averageRating(reviews)});
      return;
    }

    const recipeId = typeof request.query.recipeId === "string" ? request.query.recipeId : "";
    if (!recipeId || !recipeIdPattern.test(recipeId)) {
      response.status(400).json({error: "A valid recipeId is required"});
      return;
    }
    const reviews = await readRecipeReviews(recipeId);
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.status(200).json({reviews, rating: averageRating(reviews)});
  } catch (error) {
    sendError(response, error);
  }
});

export const deadlineFoodRecipeCreate = onRequest(recommenderHttpOptions, async (request, response) => {
  if (rejectUnsupportedRecommenderMethod(request, response)) return;

  const body = asRecord(request.body);
  const recipeId = typeof body?.id === "string" ? body.id : null;
  if (!body || !recipeId || !recipeIdPattern.test(recipeId)) {
    response.status(400).json({error: "A valid recipe id is required"});
    return;
  }

  try {
    // Canonical recipe content -> Firestore (issue #123). Reviews live in the
    // recipeReviews collection only, so strip them (and the derived rating) here.
    const recipeContent = {...body};
    delete recipeContent.reviews;
    delete recipeContent.rating;
    await recipesRef.doc(recipeId).set(
      {...recipeContent, updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
  } catch (error) {
    logger.error("Recipe could not be written to Firestore", {recipeId, error});
    response.status(502).json({error: "Recipe could not be saved"});
    return;
  }

  // Embedding keyed by the recipe UID -> pgvector recommender.
  await proxyRecommenderRequest(request, response, "/recipes", toRecommenderRecipePayload(body));
});

export const deadlineFoodRecommendations = onRequest(recommenderHttpOptions, async (request, response) => {
  await proxyRecommenderRecommendations(request, response);
});

export const deadlineFoodInteraction = onRequest(recommenderHttpOptions, async (request, response) => {
  await proxyRecommenderRequest(request, response, "/interactions");
});

export const deadlineFoodDeadlineContext = onRequest(recommenderHttpOptions, async (request, response) => {
  await proxyRecommenderRequest(request, response, "/context/deadlines");
});

export const deadlineFoodNutrition = onRequest(nutritionHttpOptions, async (request, response) => {
  if (rejectUnsupportedNutritionMethod(request, response)) return;

  try {
    const body = readRequestBody(request);
    const rawIngredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
    const ingredients = rawIngredients.filter(isRecipeIngredient).slice(0, 12);

    if (ingredients.length === 0) {
      response.status(400).json({error: "At least one ingredient with a quantity is required."});
      return;
    }

    if (rawIngredients.length > 12) {
      response.status(400).json({error: "A maximum of 12 ingredients can be checked at once."});
      return;
    }

    const lookups = await Promise.all(
      ingredients.map(async (ingredient) => {
        const product = await findOpenFoodFactsProductForIngredient(ingredient);
        return product ? estimateIngredientNutrition(ingredient, product) : null;
      }),
    );
    const estimates = lookups.filter((estimate): estimate is IngredientNutritionEstimate => estimate !== null);
    const missingIngredients = ingredients
      .filter((ingredient) => !estimates.some((estimate) => estimate.ingredient.name === ingredient.name))
      .map((ingredient) => ingredient.name);

    if (estimates.length === 0) {
      response.status(502).json({
        error: "OpenFoodFacts did not return usable nutrition data for these ingredients.",
      });
      return;
    }

    response.set("Cache-Control", "private, max-age=0, no-store");
    response.status(200).json(totalNutritionFromEstimates(estimates, missingIngredients));
  } catch (error) {
    logger.error("Deadline food nutrition function failed", error);
    response.status(500).json({error: "Nutrition data could not be loaded"});
  }
});

export const deadlineFoodSession = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedSessionMethod(request, response)) return;

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const requestedSessionId = request.query.sessionId;
      const sessionId = typeof requestedSessionId === "string" ? requestedSessionId : "";

      if (!anonymousSessionIdPattern.test(sessionId)) {
        response.status(400).json({error: "A valid anonymous session ID is required."});
        return;
      }

      const sessionRef = anonymousSessionsRef.doc(sessionId);
      const snapshot = await sessionRef.get();

      if (!snapshot.exists) {
        sendSessionJson(response, sessionId, null, null);
        return;
      }

      const data = snapshot.data();
      const settings = normalizePrototypeSessionSettings(data?.settings);
      const expiresAt = sessionExpiryTimestamp();

      await sessionRef.set(
        {
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt,
        },
        {merge: true},
      );

      sendSessionJson(response, sessionId, settings, expiresAt);
      return;
    }

    const body = readRequestBody(request);

    if (body === null) {
      response.status(400).json({error: "Session request body must be an object."});
      return;
    }

    const requestedSessionId = body?.sessionId;
    const sessionId =
      typeof requestedSessionId === "string" &&
      anonymousSessionIdPattern.test(requestedSessionId) ?
        requestedSessionId :
        randomUUID();
    let settings: PrototypeSessionSettings;

    try {
      settings = normalizePrototypeSessionSettings(body.settings);
    } catch (error) {
      response.status(400).json({error: error instanceof Error ? error.message : "Invalid session settings."});
      return;
    }

    const sessionRef = anonymousSessionsRef.doc(sessionId);
    const existingSession = await sessionRef.get();
    const expiresAt = sessionExpiryTimestamp();

    await sessionRef.set(
      {
        ...(existingSession.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
        schemaVersion: 1,
        settingsVersion: prototypeSessionSettingsVersion,
        settings,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt,
      },
      {merge: true},
    );

    sendSessionJson(response, sessionId, settings, expiresAt);
  } catch (error) {
    logger.error("Deadline food session function failed", error);
    response.status(500).json({error: "Anonymous session could not be saved"});
  }
});

export const calendarFetchIcs = onRequest(publicHttpOptions, async (request, response) => {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  const body = readRequestBody(request);
  const url = typeof body?.url === "string" ? (body.url as string).trim() : "";

  if (!url) {
    response.status(400).json({error: "A calendar URL is required."});
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    response.status(400).json({error: "Invalid URL."});
    return;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    response.status(400).json({error: "Only https:// URLs are supported."});
    return;
  }

  let upstream: globalThis.Response | null;
  try {
    upstream = await fetch(url, {
      headers: {Accept: "text/calendar, text/plain"},
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    upstream = null;
  }

  if (!upstream || !upstream.ok) {
    response.status(502).json({
      error: `Calendar could not be fetched (${upstream?.status ?? "network error"}).`,
    });
    return;
  }

  const text = await upstream.text();

  if (!text.includes("BEGIN:VCALENDAR")) {
    response.status(422).json({error: "The URL did not return a valid iCalendar file."});
    return;
  }

  response.set("Content-Type", "text/calendar; charset=utf-8");
  response.status(200).send(text);
});

export const calendarGoogleExchange = onRequest(googleOAuthHttpOptions, async (request, response) => {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }
  if (request.method !== "POST") {
    response.set("Allow", "POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  const body = readRequestBody(request);
  const code = typeof body?.code === "string" ? body.code : "";
  const redirectUri = typeof body?.redirectUri === "string" ? body.redirectUri : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

  if (!code || !redirectUri) {
    response.status(400).json({error: "code and redirectUri are required."});
    return;
  }

  try {
    const tokenResult = await exchangeGoogleCode(
      code,
      redirectUri,
      googleClientId.value(),
      googleClientSecret.value(),
    );
    const events = await fetchGoogleEvents(tokenResult.accessToken);

    if (sessionId && anonymousSessionIdPattern.test(sessionId) && tokenResult.refreshToken) {
      const sessionRef = anonymousSessionsRef.doc(sessionId);
      const snapshot = await sessionRef.get();
      if (snapshot.exists) {
        const existingTokens: CalendarToken[] = (snapshot.data()?.settings?.calendarTokens ?? [])
          .filter((t: CalendarToken) => t.provider !== "google");
        existingTokens.push({
          provider: "google",
          refreshToken: tokenResult.refreshToken,
          expiresAt: tokenResult.expiresAt,
          addedAt: new Date().toISOString(),
        });
        await sessionRef.set(
          {settings: {calendarTokens: existingTokens}, updatedAt: FieldValue.serverTimestamp()},
          {merge: true},
        );
      }
    }

    response.json({
      events,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
    });
  } catch (error) {
    logger.error("Google calendar exchange failed", error);
    const message = error instanceof Error ? error.message : "Google Calendar import failed";
    response.status(502).json({error: message});
  }
});

export const calendarOutlookExchange = onRequest(microsoftOAuthHttpOptions, async (request, response) => {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }
  if (request.method !== "POST") {
    response.set("Allow", "POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  const body = readRequestBody(request);
  const code = typeof body?.code === "string" ? body.code : "";
  const redirectUri = typeof body?.redirectUri === "string" ? body.redirectUri : "";
  const codeVerifier = typeof body?.codeVerifier === "string" ? body.codeVerifier : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

  if (!code || !redirectUri || !codeVerifier) {
    response.status(400).json({error: "code, redirectUri and codeVerifier are required."});
    return;
  }

  try {
    const tokenResult = await exchangeOutlookCode(
      code,
      redirectUri,
      codeVerifier,
      microsoftClientId.value(),
      microsoftClientSecret.value(),
    );
    const events = await fetchOutlookEvents(tokenResult.accessToken);

    if (sessionId && anonymousSessionIdPattern.test(sessionId) && tokenResult.refreshToken) {
      const sessionRef = anonymousSessionsRef.doc(sessionId);
      const snapshot = await sessionRef.get();
      if (snapshot.exists) {
        const existingTokens: CalendarToken[] = (snapshot.data()?.settings?.calendarTokens ?? [])
          .filter((t: CalendarToken) => t.provider !== "outlook");
        existingTokens.push({
          provider: "outlook",
          refreshToken: tokenResult.refreshToken,
          expiresAt: tokenResult.expiresAt,
          addedAt: new Date().toISOString(),
        });
        await sessionRef.set(
          {settings: {calendarTokens: existingTokens}, updatedAt: FieldValue.serverTimestamp()},
          {merge: true},
        );
      }
    }

    response.json({
      events,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
    });
  } catch (error) {
    logger.error("Outlook calendar exchange failed", error);
    const message = error instanceof Error ? error.message : "Outlook Calendar import failed";
    response.status(502).json({error: message});
  }
});

export const calendarSubscriptionRefresh = onSchedule(
  {
    schedule: "every 6 hours",
    region: "europe-west2",
    timeoutSeconds: 120,
    retryCount: 1,
    secrets: calendarOAuthSecrets,
  },
  async () => {
    const recentCutoff = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const sessions = await anonymousSessionsRef
      .where("updatedAt", ">", recentCutoff)
      .limit(200)
      .get();

    let refreshed = 0;
    let pruned = 0;
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const doc of sessions.docs) {
      const data = doc.data();
      const settings = data?.settings;
      if (!settings) continue;

      const subs: IcsSubscription[] = settings.icsSubscriptions ?? [];
      const tokens: CalendarToken[] = settings.calendarTokens ?? [];
      const hasCalendarSources = subs.length > 0 || tokens.length > 0;

      if (!hasCalendarSources) {
        const deadlines: Array<{id: string; rawDate?: string}> = settings.deadlines ?? [];
        const filtered = deadlines.filter((d) => !d.rawDate || d.rawDate >= todayIso);
        if (filtered.length < deadlines.length) {
          await doc.ref.set(
            {settings: {deadlines: filtered}, updatedAt: FieldValue.serverTimestamp()},
            {merge: true},
          );
          pruned++;
        }
        continue;
      }

      try {
        const allEvents: CalendarEvent[] = [];

        for (const sub of subs) {
          try {
            const upstream = await fetch(sub.url, {
              headers: {Accept: "text/calendar, text/plain"},
              signal: AbortSignal.timeout(15_000),
            });
            if (upstream.ok) {
              const text = await upstream.text();
              if (text.includes("BEGIN:VCALENDAR")) {
                const parsed = parseICSText(text, sub.source);
                allEvents.push(...filterFutureEvents(parsed));
              }
            }
          } catch (e) {
            logger.warn(`ICS fetch failed for session ${doc.id}`, e);
          }
        }

        const updatedTokens = [...tokens];
        for (const [i, token] of tokens.entries()) {
          try {
            if (token.provider === "google") {
              const refreshed = await refreshGoogleToken(
                token.refreshToken,
                googleClientId.value(),
                googleClientSecret.value(),
              );
              const events = await fetchGoogleEvents(refreshed.accessToken);
              allEvents.push(...events);
              updatedTokens[i] = {...token, expiresAt: refreshed.expiresAt};
            } else if (token.provider === "outlook") {
              const refreshed = await refreshOutlookToken(
                token.refreshToken,
                microsoftClientId.value(),
                microsoftClientSecret.value(),
              );
              const events = await fetchOutlookEvents(refreshed.accessToken);
              allEvents.push(...events);
              updatedTokens[i] = {
                ...token,
                refreshToken: refreshed.newRefreshToken,
                expiresAt: refreshed.expiresAt,
              };
            }
          } catch (e) {
            logger.warn(`OAuth refresh failed for session ${doc.id}, provider ${token.provider}`, e);
          }
        }

        const existingDeadlines: Array<{id: string; rawDate?: string}> = settings.deadlines ?? [];
        const manualDeadlines = existingDeadlines.filter(
          (d) => d.id.startsWith("manual-") && (!d.rawDate || d.rawDate >= todayIso),
        );
        const freshDeadlines = calendarEventsToDeadlines(allEvents);

        await doc.ref.set(
          {
            settings: {
              calendarEvents: allEvents.slice(0, 250),
              calendarTokens: updatedTokens,
              deadlines: [...freshDeadlines, ...manualDeadlines].slice(0, 50),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        refreshed++;
      } catch (e) {
        logger.error(`Calendar refresh failed for session ${doc.id}`, e);
      }
    }

    logger.info(`Calendar refresh complete: ${refreshed} refreshed, ${pruned} pruned, ${sessions.size} checked`);
  },
);

export const deadlineFoodRecipePhoto = onRequest(publicHttpOptions, async (request, response) => {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "POST, OPTIONS");
    response.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    const body = readRequestBody(request);
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim() : "";
    const dataBase64 = typeof body?.dataBase64 === "string" ? body.dataBase64 : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "photo";

    if (!allowedPhotoMimeTypes.has(mimeType)) {
      response.status(400).json({error: "Only JPEG, PNG and WebP images are supported."});
      return;
    }

    if (!dataBase64) {
      response.status(400).json({error: "Image data is required."});
      return;
    }

    const fileBuffer = Buffer.from(dataBase64, "base64");

    if (fileBuffer.length === 0) {
      response.status(400).json({error: "Image data is required."});
      return;
    }

    if (fileBuffer.length > maxPhotoBytes) {
      response.status(400).json({error: "Image must be under 5 MB."});
      return;
    }

    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const safeName = `${randomUUID()}.${ext}`;
    const objectPath = `recipe-photos/${safeName}`;

    logger.info("Uploading recipe photo", {fileName, mimeType, bytes: fileBuffer.length});

    const bucket = getStorage().bucket(storageBucket);
    const file = bucket.file(objectPath);

    await file.save(fileBuffer, {
      contentType: mimeType,
      metadata: {cacheControl: "public, max-age=31536000"},
    });

    const storageEmulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    let photoUrl: string;

    if (storageEmulatorHost) {
      // Storage emulator serves all files publicly — makePublic() is a no-op / unsupported there.
      // Return the emulator download URL so the browser can load the image locally.
      const encodedPath = encodeURIComponent(objectPath);
      photoUrl = `http://${storageEmulatorHost}/v0/b/${encodeURIComponent(storageBucket)}/o/${encodedPath}?alt=media`;
    } else {
      await file.makePublic();
      photoUrl = `https://storage.googleapis.com/${storageBucket}/${objectPath}`;
    }
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.status(200).json({photoUrl});
  } catch (error) {
    logger.error("Recipe photo upload failed", error);
    response.status(500).json({error: "Photo could not be uploaded."});
  }
});
