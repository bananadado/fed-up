import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {randomUUID} from "crypto";
import {buildPlan} from "./autoPlan";
import type * as AutoPlan from "./autoPlan";
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
const firebaseAuth = getAuth();
const prototypeRef = firestore.collection("prototypeData").doc("deadlineFood");
// Canonical recipe content lives in Firestore (issue #123). pgvector stores only
// the recipe UID as primary key plus its embedding; reviews are Firestore-only.
const recipesRef = firestore.collection("recipes");
const recipeReviewsRef = firestore.collection("recipeReviews");
const anonymousSessionsRef = firestore.collection("anonymousSessions");
const accountSessionsRef = firestore.collection("accountSessions");
const openFoodFactsCacheRef = firestore.collection("openFoodFactsNutritionCache");
const anonymousSessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;
const recipeIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const sessionRetentionDays = 90;
const sessionRetentionMs = sessionRetentionDays * 24 * 60 * 60 * 1000;
const prototypeSessionSettingsVersion = 3;
// Versions whose payloads we can read & migrate forward to the current schema.
const supportedSessionSettingsVersions = new Set([1, 2, 3]);
const publicHttpOptions = {cors: true, invoker: "public"} as const;
// USDA FoodData Central key for live nutrition lookups. Set in production with
// `firebase functions:secrets:set USDA_API_KEY`; falls back to the heavily
// rate-limited DEMO_KEY when unset (e.g. local emulator without functions/.env).
const usdaApiKey = defineSecret("USDA_API_KEY");
const nutritionHttpOptions = {
  ...publicHttpOptions,
  timeoutSeconds: 300,
  secrets: [usdaApiKey],
};
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
const usdaFdcBaseUrl = (
  process.env.USDA_FDC_BASE_URL ?? "https://api.nal.usda.gov/fdc"
).replace(/\/$/, "");
const storageBucket = "drp03-50059.firebasestorage.app";
const maxPhotoBytes = 5 * 1024 * 1024;
const allowedPhotoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const usdaTimeoutMs = 8000;
// The api-umbrella gateway sprays spurious 4xx/429s under load; retry on any
// non-2xx so transient blips don't surface as missing ingredients.
const usdaMaxAttempts = 6;
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

// Which upstream database a cached product came from. The cache is populated by
// the ingestion scripts (USDA first, OpenFoodFacts fallback); the function may
// also fetch live from OpenFoodFacts on a cache miss.
type NutritionProvider = "USDA" | "OpenFoodFacts";

type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: {
    provider: NutritionProvider | "USDA + OpenFoodFacts";
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
  provider?: NutritionProvider;
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
  provider: NutritionProvider;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type FdcNutrient = {
  nutrientNumber?: string;
  value?: number;
};

type FdcFood = {
  fdcId?: number;
  description?: string;
  dataType?: string;
  foodNutrients?: FdcNutrient[];
};

type FdcSearchResponse = {
  foods?: FdcFood[];
};

type HttpRequest = {
  method: string;
  query: Record<string, unknown>;
  body: unknown;
  headers?: Record<string, unknown>;
  get?(name: string): string | undefined;
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
    planningHorizonDays: number;
    planRegenMode: "prompt" | "auto";
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
  planMeals: UnknownRecord[];
  calendarEvents: CalendarEvent[];
  icsSubscriptions: IcsSubscription[];
  calendarTokens: CalendarToken[];
  planSignature?: string;
  planGeneratedAt?: string;
  calendarProvider?: string;
  calendarSkipped?: boolean;
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
const recommenderDietaryTags = new Set(["vegetarian", "vegan", "halal", "gluten-free", "dairy-free"]);
const recommenderTagAliases: Record<string, string> = {
  "peanuts": "peanut",
  "eggs": "egg",
};

function canonicalRecommenderTag(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return recommenderTagAliases[normalized] ?? normalized;
}

function canonicalRecommenderTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(canonicalRecommenderTag).filter(Boolean))];
}

function toRecommenderRecipePayload(recipe: UnknownRecord): UnknownRecord {
  const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const str = (value: unknown): string => (typeof value === "string" ? value : "");
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const nutrition = asRecord(recipe.nutrition) ?? {};
  const tags = canonicalRecommenderTags(recipe.tags);
  const dietaryTags = tags.filter((tag) => recommenderDietaryTags.has(tag));
  const suitabilityTags = tags.filter((tag) => !recommenderDietaryTags.has(tag));

  return {
    id: recipe.id,
    name: str(recipe.name),
    meal_type: str(recipe.type) || "cook",
    meal_slots: list(recipe.mealSlots),
    price_pence: Math.round(num(recipe.price) * 100),
    prep_minutes: num(recipe.time),
    dietary_tags: dietaryTags,
    allergens: canonicalRecommenderTags(recipe.allergens),
    suitability_tags: suitabilityTags,
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
    request.method !== "POST" &&
    request.method !== "DELETE"
  ) {
    response.set("Allow", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
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

  if (typeof settings.settingsVersion !== "number" || !supportedSessionSettingsVersions.has(settings.settingsVersion)) {
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
      planningHorizonDays: Math.round(boundedNumber(preferences.planningHorizonDays, 21, 1, 28)),
      planRegenMode: preferences.planRegenMode === "auto" ? "auto" : "prompt",
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
    plan: normalizeRecipeList(settings.plan, 31),
    planMeals: normalizeRecipeList(settings.planMeals, 200),
    ...(typeof settings.planSignature === "string" ? {planSignature: settings.planSignature.slice(0, 200)} : {}),
    ...(typeof settings.planGeneratedAt === "string" ? {planGeneratedAt: settings.planGeneratedAt.slice(0, 40)} : {}),
    ...(typeof settings.calendarProvider === "string" ?
      {calendarProvider: settings.calendarProvider.slice(0, 40)} :
      {}),
    ...(typeof settings.calendarSkipped === "boolean" ? {calendarSkipped: settings.calendarSkipped} : {}),
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

function requestHeader(request: HttpRequest, name: string): string {
  const fromGetter = typeof request.get === "function" ? request.get(name) : undefined;
  if (typeof fromGetter === "string") {
    return fromGetter;
  }

  const lowerName = name.toLowerCase();
  const value = request.headers?.[lowerName] ?? request.headers?.[name];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
}

type VerifiedAccount = {uid: string; isAnonymous: boolean};

// Resolves the verified Firebase user for a request, or null when no token is
// attached. Anonymous Firebase users are reported with isAnonymous=true so
// callers keep them on session-keyed storage — only a real (signed-in) account
// owns a uid-keyed record.
async function verifiedAccount(request: HttpRequest): Promise<VerifiedAccount | null> {
  const authorization = requestHeader(request, "authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new Error("Invalid authorization header.");
  }

  const decodedToken = await firebaseAuth.verifyIdToken(match[1]);
  return {uid: decodedToken.uid, isAnonymous: decodedToken.firebase?.sign_in_provider === "anonymous"};
}

// Firestore document id for a real account's uid-keyed session record. base64url
// keeps the raw uid out of the document path while staying deterministic.
function accountSessionDocId(uid: string): string {
  return Buffer.from(uid).toString("base64url");
}

// Stable client-facing handle for an account's session. The frontend stores it
// like any sessionId, but for an authenticated request the backend always keys
// storage by the verified uid, so the handle is only a transport token. It
// matches anonymousSessionIdPattern (base64url chars, 38 chars for a 28-char
// uid) so the existing frontend session-id validation accepts it.
function accountSessionHandle(uid: string): string {
  return accountSessionDocId(uid);
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
    const errorCause =
      typeof error === "object" && error !== null && "cause" in error ?
        (error as {cause?: unknown}).cause :
        "";
    logger.error("Recommender API request failed", {
      path,
      error: String(error instanceof Error ? error.message : error),
      cause: String(errorCause ?? ""),
    });
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

// ── Recipe auto-planning (issue #66) ─────────────────────────────────────────

// POST a payload to the recommender and return parsed JSON, or null on failure.
async function callRecommenderJson(path: string, payload: unknown): Promise<unknown | null> {
  try {
    const url = new URL(path, recommenderApiUrl.value().replace(/\/$/, ""));
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Deadline-Food-API-Key": recommenderApiKey.value(),
      },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) return null;
    return (await upstream.json()) as unknown;
  } catch (error) {
    logger.warn("Recommender call failed during auto-plan", {path, error: String(error)});
    return null;
  }
}

const PLAN_SLOTS: AutoPlan.MealSlot[] = ["breakfast", "lunch", "dinner"];

function toMealSlots(value: unknown): AutoPlan.MealSlot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is AutoPlan.MealSlot => PLAN_SLOTS.includes(s as AutoPlan.MealSlot));
}

function toMealType(value: unknown): AutoPlan.MealType {
  return value === "fallback" ? "fallback" : value === "remix" ? "remix" : "cook";
}

// Map a recommender recipe row to the prototype `Meal` shape the frontend renders.
function recommenderRecipeToMeal(recipe: UnknownRecord): UnknownRecord {
  const dietary = Array.isArray(recipe.dietary_tags) ? recipe.dietary_tags : [];
  const suitability = Array.isArray(recipe.suitability_tags) ?
    recipe.suitability_tags : [];
  return {
    id: boundedString(recipe.id, "", 80),
    name: boundedString(recipe.name, "Recipe", 200),
    type: toMealType(recipe.meal_type),
    mealSlots: toMealSlots(recipe.meal_slots),
    time: boundedNumber(recipe.prep_minutes, 20, 0, 600),
    price: boundedNumber(recipe.price_pence, 0, 0, 100000) / 100,
    tags: [...new Set([...dietary, ...suitability].filter((t): t is string => typeof t === "string"))],
    allergens: Array.isArray(recipe.allergens) ?
      recipe.allergens.filter((a): a is string => typeof a === "string") : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    nutrition: asRecord(recipe.nutrition) ?? {calories: 0, protein: 0, carbs: 0, fat: 0},
    rating: 0,
    reviews: [],
    source: boundedString(recipe.source, "Recommender", 200),
    note: boundedString(recipe.note, "", 400),
    image: "🍽️",
    ...(typeof recipe.photoUrl === "string" ? {photoUrl: recipe.photoUrl} : {}),
  };
}

// Extract the allocator-relevant subset from a prototype Meal record.
function mealToAllocator(meal: UnknownRecord): AutoPlan.AllocatorMeal {
  const ingredients = Array.isArray(meal.ingredients) ?
    meal.ingredients
      .map((i) => asRecord(i))
      .filter((i): i is UnknownRecord => i !== null)
      .map((i) => ({name: boundedString(i.name, "", 120)})) :
    [];
  return {
    id: boundedString(meal.id, "", 80),
    type: toMealType(meal.type),
    mealSlots: toMealSlots(meal.mealSlots),
    time: boundedNumber(meal.time, 20, 0, 600),
    pricePence: Math.round(boundedNumber(meal.price, 0, 0, 100000) * 100),
    tags: Array.isArray(meal.tags) ? meal.tags.filter((t): t is string => typeof t === "string") : [],
    allergens: Array.isArray(meal.allergens) ? meal.allergens.filter((a): a is string => typeof a === "string") : [],
    ingredients,
  };
}

// A neutral, lightly-pressured horizon used when no calendar context exists.
function syntheticDays(horizonDays: number): AutoPlan.DayContext[] {
  const today = new Date();
  const days: AutoPlan.DayContext[] = [];
  for (let i = 0; i < horizonDays; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      stress: 0.3,
      free_evening: true,
      hard_deadlines: 0,
      recommended_constraints: {max_prep_minutes: 60},
    });
  }
  return days;
}

function normalizeDayContext(value: unknown): AutoPlan.DayContext | null {
  const day = asRecord(value);
  if (day === null || typeof day.date !== "string") return null;
  const constraints = asRecord(day.recommended_constraints);
  return {
    date: day.date.slice(0, 10),
    stress: boundedNumber(day.stress, 0.3, 0, 1),
    free_evening: day.free_evening !== false,
    hard_deadlines: boundedNumber(day.hard_deadlines, 0, 0, 20),
    recommended_constraints: {
      max_prep_minutes: boundedNumber(constraints?.max_prep_minutes, 60, 0, 600),
    },
  };
}

async function handleAutoPlan(request: HttpRequest, response: HttpResponse): Promise<void> {
  if (rejectUnsupportedRecommenderMethod(request, response)) return;

  const body = readRequestBody(request);
  if (body === null) {
    response.status(400).json({error: "A JSON body is required."});
    return;
  }

  const userId = boundedString(body.user_id, "", 80);
  const horizonDays = Math.round(boundedNumber(body.horizonDays, 21, 1, 28));
  const contextEvents = Array.isArray(body.contextEvents) ? body.contextEvents.slice(0, 250) : [];
  const savedRecipes = Array.isArray(body.savedRecipes) ?
    body.savedRecipes.map((m) => asRecord(m)).filter((m): m is UnknownRecord => m !== null).slice(0, 200) :
    [];
  const excludeIds = boundedStringList(body.excludeIds, 250, 80);
  const excludedIds = new Set(excludeIds);
  const dietary = canonicalRecommenderTags(boundedStringList(body.dietary, 40, 80));
  const dislikes = canonicalRecommenderTags(boundedStringList(body.dislikes, 40, 80));
  const allergens = canonicalRecommenderTags(boundedStringList(body.allergens, 40, 80));
  const weeklyBudgetPence = Math.round(boundedNumber(body.budget, 48, 0, 1000) * 100);

  // 1. Per-day calendar context across the horizon (#65). horizon_days produces
  // horizon_days+1 entries (incl. today), so request one fewer than we need.
  let days: AutoPlan.DayContext[] = [];
  if (contextEvents.length > 0) {
    const context = asRecord(
      await callRecommenderJson("/context/deadlines", {events: contextEvents, horizon_days: horizonDays - 1}),
    );
    const rawDays = Array.isArray(context?.days) ? context.days : [];
    days = rawDays.map(normalizeDayContext).filter((d): d is AutoPlan.DayContext => d !== null);
  }
  if (days.length === 0) {
    days = syntheticDays(horizonDays);
  }
  days = days.slice(0, horizonDays);

  // 2. Candidate pool: saved recipes first, recommender gap-fill after.
  const mealsById = new Map<string, UnknownRecord>();
  for (const meal of savedRecipes) {
    const id = boundedString(meal.id, "", 80);
    if (id) mealsById.set(id, meal);
  }
  const savedAlloc = savedRecipes.map(mealToAllocator).filter((m) => m.id);

  const avgStress = days.reduce((sum, d) => sum + d.stress, 0) / (days.length || 1);
  const fillAlloc: AutoPlan.AllocatorMeal[] = [];
  if (userId) {
    const fill = await callRecommenderJson("/recommend", {
      user_id: userId,
      n: 60,
      deadline_stress: avgStress,
      budget_pence: weeklyBudgetPence,
      exclude_ids: excludeIds,
    });
    if (Array.isArray(fill)) {
      for (const item of fill) {
        const recipe = asRecord(asRecord(item)?.recipe);
        if (recipe === null) continue;
        const id = boundedString(recipe.id, "", 80);
        if (!id || excludedIds.has(id) || mealsById.has(id)) continue;
        const meal = recommenderRecipeToMeal(recipe);
        mealsById.set(id, meal);
        fillAlloc.push(mealToAllocator(meal));
      }
    }
  }

  // Deterministic final fallback: if the user has few/no saved recipes and the
  // recommender is empty or unavailable, still plan from the canonical catalogue.
  const fallbackAlloc: AutoPlan.AllocatorMeal[] = [];
  for (const recipe of prototypeRecipes) {
    const meal = recipe as unknown as UnknownRecord;
    const id = boundedString(meal.id, "", 80);
    if (!id || excludedIds.has(id) || mealsById.has(id)) continue;
    mealsById.set(id, meal);
    fallbackAlloc.push(mealToAllocator(meal));
  }

  const plan = buildPlan({
    days,
    pool: [...savedAlloc, ...fillAlloc, ...fallbackAlloc],
    avoided: [...dislikes, ...allergens],
    dietary,
    weeklyBudgetPence,
  });

  // 3. Return only the meals actually placed, so the client can resolve them.
  const usedIds = new Set<string>();
  for (const entry of plan) {
    for (const meal of entry.meals) usedIds.add(meal.mealId);
  }
  const meals = [...usedIds].map((id) => mealsById.get(id)).filter((m): m is UnknownRecord => m !== undefined);

  response.set("Cache-Control", "private, max-age=0, no-store");
  response.status(200).json({plan, meals, generatedAt: new Date().toISOString()});
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
    provider: product.provider ?? "OpenFoodFacts",
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
  const usedUsda = estimates.some((estimate) => estimate.provider === "USDA");
  const usedOff = estimates.some((estimate) => estimate.provider === "OpenFoodFacts");
  const provider =
    usedUsda && usedOff ? "USDA + OpenFoodFacts" : usedUsda ? "USDA" : "OpenFoodFacts";

  return {
    calories: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.calories, 0)),
    protein: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.protein, 0)),
    carbs: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.carbs, 0)),
    fat: roundMacro(estimates.reduce((sum, estimate) => sum + estimate.fat, 0)),
    source: {
      provider,
      label: `${provider} estimate`,
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
    provider:
      product.provider === "USDA" || product.provider === "OpenFoodFacts" ?
        product.provider :
        undefined,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// ── USDA FoodData Central live lookup ──────────────────────────────────────
// Mirrors scripts/ingest/usda.ts so the live fetch and the cache-population
// scripts resolve ingredients identically. USDA replaced OpenFoodFacts: it
// indexes generic cooking ingredients far more reliably (OFF's barcoded-product
// category search returned nonsense like "baby lettuce leaves" → banana muesli).

const usdaGenericDataTypes = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)"]);
const usdaPreferWindow = 12;

// Aliases for names USDA doesn't index under that spelling (misspellings /
// regional names), keyed by de-accented lower-case. Only the query is rewritten.
const usdaIngredientAliases: Record<string, string> = {
  "challots": "shallots",
  "cassaba": "casaba",
  "jamon iberico": "prosciutto",
  "khus khus": "spices poppy seed",
  "mulukhiyah": "jute",
};

function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function fdcNutrientValue(food: FdcFood, ...numbers: string[]): number | undefined {
  for (const number of numbers) {
    const hit = food.foodNutrients?.find((nutrient) => String(nutrient.nutrientNumber) === number);
    if (hit && typeof hit.value === "number") return hit.value;
  }
  return undefined;
}

// Map an FDC food onto the per-100g product shape, or null when it lacks any of
// the four macros. Energy falls back to the Atwater values (957/958) some
// Foundation foods carry instead of nutrient 208.
function fdcToProduct(food: FdcFood): OpenFoodFactsProduct | null {
  const calories = fdcNutrientValue(food, "208", "957", "958");
  const protein = fdcNutrientValue(food, "203");
  const carbs = fdcNutrientValue(food, "205");
  const fat = fdcNutrientValue(food, "204");

  if (
    typeof calories !== "number" ||
    typeof protein !== "number" ||
    typeof carbs !== "number" ||
    typeof fat !== "number"
  ) {
    return null;
  }

  return {
    provider: "USDA",
    ...(typeof food.fdcId === "number" ? {code: String(food.fdcId)} : {}),
    ...(food.description ? {product_name: food.description} : {}),
    nutriments: {
      "energy-kcal_100g": calories,
      "proteins_100g": protein,
      "carbohydrates_100g": carbs,
      "fat_100g": fat,
    },
  };
}

// Run one FDC search, retrying any non-2xx (the gateway emits spurious 4xx/429s)
// and network/timeout errors with jittered backoff that honours Retry-After.
// Returns [] only on a real HTTP 200 with no foods; null on persistent failure.
async function searchFdcFoods(query: string): Promise<FdcFood[] | null> {
  // usdaFdcBaseUrl carries a `/fdc` path, so concatenate rather than use the
  // URL(base) form (a leading-slash path would resolve against the origin only).
  const url = new URL(`${usdaFdcBaseUrl}/v1/foods/search`);
  url.searchParams.set("api_key", process.env.USDA_API_KEY ?? "DEMO_KEY");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");

  for (let attempt = 1; attempt <= usdaMaxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {"Accept": "application/json"},
      signal: AbortSignal.timeout(usdaTimeoutMs),
    }).catch(() => null);

    if (response?.ok) {
      const payload = await response.json().catch(() => null) as FdcSearchResponse | null;
      return payload?.foods ?? [];
    }

    if (attempt < usdaMaxAttempts) {
      const retryAfter = Number(response?.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ?
        retryAfter * 1000 :
        400 + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
  }

  logger.warn("USDA FDC search failed after retries", {query});
  return null;
}

async function fetchUsdaProductForIngredient(
  ingredient: RecipeIngredient,
): Promise<OpenFoodFactsProduct | null> {
  const deaccented = deaccent(ingredient.name.trim());
  if (!deaccented) return null;
  const query = usdaIngredientAliases[deaccented.toLowerCase()] ?? deaccented;

  const foods = await searchFdcFoods(query);
  if (foods === null || foods.length === 0) return null;

  // Walk results in USDA's relevance order. Within the top usdaPreferWindow hits
  // prefer cleaner generic whole-foods (raw/fresh, then any non-branded), else
  // fall back to the first complete-macro hit in relevance order.
  let rawGeneric: OpenFoodFactsProduct | null = null;
  let anyGeneric: OpenFoodFactsProduct | null = null;
  let fallback: OpenFoodFactsProduct | null = null;

  for (const [i, food] of foods.entries()) {
    const product = fdcToProduct(food);
    if (!product) continue;

    if (fallback === null) fallback = product;
    if (i >= usdaPreferWindow) continue;

    if (usdaGenericDataTypes.has(food.dataType ?? "")) {
      if (anyGeneric === null) anyGeneric = product;
      if (rawGeneric === null && /\b(raw|fresh)\b/i.test(food.description ?? "")) {
        rawGeneric = product;
      }
    }
  }

  return rawGeneric ?? anyGeneric ?? fallback;
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

async function findNutritionProductForIngredient(
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
    const product = await fetchUsdaProductForIngredient(ingredient);
    await cacheOpenFoodFactsProduct(cacheKey, product);
    return product;
  } catch (error) {
    logger.error("USDA lookup failed", {cacheKey, error});
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

export const deadlineFoodRecipeDelete = onRequest(recommenderHttpOptions, async (request, response) => {
  if (rejectUnsupportedRecommenderMethod(request, response)) return;

  const body = asRecord(request.body);
  const recipeId = typeof body?.recipeId === "string" ? body.recipeId : null;
  if (!recipeId || !recipeIdPattern.test(recipeId)) {
    response.status(400).json({error: "A valid recipe id is required"});
    return;
  }

  try {
    await recipesRef.doc(recipeId).delete();
    await recipeReviewsRef.doc(recipeId).delete();
  } catch (error) {
    logger.error("Recipe could not be deleted from Firestore", {recipeId, error});
    response.status(502).json({error: "Recipe could not be deleted"});
    return;
  }

  try {
    const url = new URL(`/recipes/${encodeURIComponent(recipeId)}`, recommenderApiUrl.value().replace(/\/$/, ""));
    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Deadline-Food-API-Key": recommenderApiKey.value(),
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    logger.warn("Recipe could not be deleted from recommender (Firestore deletion succeeded)", {recipeId, error});
  }

  response.status(204).send("");
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

export const deadlineFoodAutoPlan = onRequest(recommenderHttpOptions, async (request, response) => {
  await handleAutoPlan(request, response);
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
        const product = await findNutritionProductForIngredient(ingredient);
        return product ? estimateIngredientNutrition(ingredient, product) : null;
      }),
    );
    const estimates = lookups.filter((estimate): estimate is IngredientNutritionEstimate => estimate !== null);
    const missingIngredients = ingredients
      .filter((ingredient) => !estimates.some((estimate) => estimate.ingredient.name === ingredient.name))
      .map((ingredient) => ingredient.name);

    if (estimates.length === 0) {
      response.status(502).json({
        error: "USDA did not return usable nutrition data for these ingredients.",
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

// Loads a real account's uid-keyed session. On the very first load for an
// account (no stored record yet) it adopts the anonymous session the request
// arrived with — the in-progress onboarding the user just built — so signing in
// mid-onboarding never discards their plan. Later loads (including on a fresh
// device) just return the synced account record.
async function handleAccountSessionGet(
  request: HttpRequest,
  response: HttpResponse,
  uid: string,
): Promise<void> {
  const accountRef = accountSessionsRef.doc(accountSessionDocId(uid));
  const snapshot = await accountRef.get();

  if (!snapshot.exists) {
    const requestedSessionId = typeof request.query.sessionId === "string" ? request.query.sessionId : "";
    if (anonymousSessionIdPattern.test(requestedSessionId)) {
      const anonRef = anonymousSessionsRef.doc(requestedSessionId);
      const anonSnapshot = await anonRef.get();
      if (anonSnapshot.exists && anonSnapshot.data()?.settings) {
        const adopted = normalizePrototypeSessionSettings(anonSnapshot.data()?.settings);
        // Account sessions never expire (expiresAt is explicitly deleted so no TTL
        // policy can reap them); only anonymous sessions carry a rolling TTL.
        await accountRef.set(
          {
            createdAt: FieldValue.serverTimestamp(),
            uid,
            schemaVersion: 1,
            settingsVersion: prototypeSessionSettingsVersion,
            settings: adopted,
            updatedAt: FieldValue.serverTimestamp(),
            expiresAt: FieldValue.delete(),
          },
          {merge: true},
        );
        // The anonymous save has now been migrated into the account record, so
        // drop the redundant anonymous session document.
        await anonRef.delete();
        sendSessionJson(response, accountSessionHandle(uid), adopted, null);
        return;
      }
    }

    sendSessionJson(response, accountSessionHandle(uid), null, null);
    return;
  }

  const settings = normalizePrototypeSessionSettings(snapshot.data()?.settings);
  await accountRef.set({updatedAt: FieldValue.serverTimestamp(), expiresAt: FieldValue.delete()}, {merge: true});
  sendSessionJson(response, accountSessionHandle(uid), settings, null);
}

// Permanently deletes a signed-in account: its synced profile document and the
// Firebase Auth user itself. Called via DELETE once the user confirms in
// Settings. Anonymous sessions have no account to delete — they lapse via TTL.
async function handleAccountSessionDelete(
  response: HttpResponse,
  uid: string,
): Promise<void> {
  await accountSessionsRef.doc(accountSessionDocId(uid)).delete();
  await firebaseAuth.deleteUser(uid);
  response.status(200).json({deleted: true});
}

export const deadlineFoodSession = onRequest(publicHttpOptions, async (request, response) => {
  if (rejectUnsupportedSessionMethod(request, response)) return;

  try {
    let account: VerifiedAccount | null;
    try {
      account = await verifiedAccount(request);
    } catch {
      response.status(401).json({error: "Invalid Firebase authentication token."});
      return;
    }

    // A real (non-anonymous) account keys its data directly by uid. Anonymous
    // users — including anonymous Firebase users — stay keyed by the session id
    // their browser holds in localStorage.
    const accountUid = account !== null && !account.isAnonymous ? account.uid : null;

    if (request.method === "DELETE") {
      if (accountUid === null) {
        response.status(401).json({error: "A signed-in account is required to delete an account."});
        return;
      }
      await handleAccountSessionDelete(response, accountUid);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (accountUid !== null) {
        await handleAccountSessionGet(request, response, accountUid);
        return;
      }

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

      const settings = normalizePrototypeSessionSettings(snapshot.data()?.settings);
      const expiresAt = sessionExpiryTimestamp();
      await sessionRef.set({updatedAt: FieldValue.serverTimestamp(), expiresAt}, {merge: true});
      sendSessionJson(response, sessionId, settings, expiresAt);
      return;
    }

    const body = readRequestBody(request);

    if (body === null) {
      response.status(400).json({error: "Session request body must be an object."});
      return;
    }

    let settings: PrototypeSessionSettings;

    try {
      settings = normalizePrototypeSessionSettings(body.settings);
    } catch (error) {
      response.status(400).json({error: error instanceof Error ? error.message : "Invalid session settings."});
      return;
    }

    const expiresAt = sessionExpiryTimestamp();

    if (accountUid !== null) {
      const accountRef = accountSessionsRef.doc(accountSessionDocId(accountUid));
      const existing = await accountRef.get();
      // Account sessions never expire — clear any TTL field a previous write left.
      await accountRef.set(
        {
          ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
          uid: accountUid,
          schemaVersion: 1,
          settingsVersion: prototypeSessionSettingsVersion,
          settings,
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: FieldValue.delete(),
        },
        {merge: true},
      );
      sendSessionJson(response, accountSessionHandle(accountUid), settings, null);
      return;
    }

    const requestedSessionId = body?.sessionId;
    const sessionId =
      typeof requestedSessionId === "string" &&
      anonymousSessionIdPattern.test(requestedSessionId) ?
        requestedSessionId :
        randomUUID();
    const sessionRef = anonymousSessionsRef.doc(sessionId);
    const existingSession = await sessionRef.get();

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
