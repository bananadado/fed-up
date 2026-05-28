import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import * as logger from "firebase-functions/logger";
import {randomUUID} from "crypto";
import {
  canonicalConstraints,
  deadlineBootstrap,
  prototypeMeta,
  seededMeals,
} from "./generated/prototypeData";

initializeApp();
setGlobalOptions({region: "europe-west2", maxInstances: 10});

const firestore = getFirestore();
const prototypeRef = firestore.collection("prototypeData").doc("deadlineFood");
const anonymousSessionsRef = firestore.collection("anonymousSessions");
const openFoodFactsCacheRef = firestore.collection("openFoodFactsNutritionCache");
const openFoodFactsRateLimitRef = firestore
  .collection("serviceRateLimits")
  .doc("openFoodFactsSearchV2");
const anonymousSessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;
const sessionRetentionDays = 90;
const sessionRetentionMs = sessionRetentionDays * 24 * 60 * 60 * 1000;
const prototypeSessionSettingsVersion = 1;
const publicHttpOptions = {cors: true, invoker: "public"} as const;
const nutritionHttpOptions = {
  ...publicHttpOptions,
  timeoutSeconds: 300,
} as const;
const openFoodFactsProductionBaseUrl = "https://world.openfoodfacts.org";
const openFoodFactsStagingBaseUrl = "https://world.openfoodfacts.net";
const openFoodFactsBaseUrl = (
  process.env.OPENFOODFACTS_BASE_URL ??
  (process.env.FUNCTIONS_EMULATOR === "true" ? openFoodFactsStagingBaseUrl : openFoodFactsProductionBaseUrl)
).replace(/\/$/, "");
const openFoodFactsUserAgent =
  process.env.OPENFOODFACTS_USER_AGENT ??
  "DeadlineFoodPrototype/0.1 Firebase Functions";
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

type PrototypeSessionSettings = {
  settingsVersion: typeof prototypeSessionSettingsVersion;
  preferences: {
    maxTime: number | null;
    budget: number;
    kitchen: string;
    postcode: string;
    university: string;
    dietary: string[];
    allergens: string[];
    dislikes: string[];
    likes: string[];
  };
  deadlines: {
    id: string;
    title: string;
    date: string;
    time: string;
    intensity: string;
  }[];
  selectedSources: string[];
  onboarded: boolean;
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
  };
}

function normalizePrototypeSessionSettings(value: unknown): PrototypeSessionSettings {
  const settings = asRecord(value);

  if (settings === null) {
    throw new Error("Session settings must be an object.");
  }

  if (settings.settingsVersion !== prototypeSessionSettingsVersion) {
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
      postcode: boundedString(preferences.postcode, "", 24),
      university: boundedString(preferences.university, "", 160),
      dietary: boundedStringList(preferences.dietary),
      allergens: boundedStringList(preferences.allergens),
      dislikes: boundedStringList(preferences.dislikes),
      likes: boundedStringList(preferences.likes),
    },
    deadlines: Array.isArray(settings.deadlines) ?
      settings.deadlines
        .map(normalizeDeadline)
        .filter((deadline): deadline is NonNullable<typeof deadline> => deadline !== null)
        .slice(0, 20) :
      [],
    selectedSources: boundedStringList(settings.selectedSources),
    onboarded: settings.onboarded === true,
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
