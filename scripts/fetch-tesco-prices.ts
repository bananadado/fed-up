#!/usr/bin/env bun
/**
 * Fetch Tesco product-price candidates for every unique recipe ingredient.
 *
 * This script uses Playwright to drive a browser through Tesco search pages and
 * writes raw product candidates. It deliberately does not update the canonical
 * ingredient price table or database. Feed its output into:
 *
 *   bun run prices:import-tesco -- --input data/raw/tesco-products.json
 *
 * Data sources for ingredients:
 *   --source recommender  Reads /recipes from RECOMMENDER_API_URL (default)
 *   --source firestore    Reads Firestore recipes collection
 *   --ingredients-file    Reads one ingredient per line, or JSON string array
 *
 * Usage:
 *   TESCO_PRICE_FETCH_ACCEPT_TERMS=1 bun scripts/fetch-tesco-prices.ts --headful
 *   TESCO_PRICE_FETCH_ACCEPT_TERMS=1 bun scripts/fetch-tesco-prices.ts --source firestore
 */

import { mkdir } from "fs/promises";
import path from "path";

import { chromium, firefox, type Browser, type BrowserContext, type BrowserType, type Page } from "@playwright/test";

import { initFirebase, getFirestore } from "./ingest/firebase.ts";
import { listRecipes, recommenderUrl } from "./ingest/recommender.ts";
import type { Ingredient } from "./ingest/types.ts";

type IngredientSource = "recommender" | "firestore";
type BrowserName = "chromium" | "firefox";

type TescoProductCandidate = {
  searchIngredient: string;
  productId?: string;
  productName: string;
  price: string;
  pricePence: number;
  unitPriceText?: string;
  unitPriceBasis?: string;
  preferredUnitPrice: boolean;
  packageSize?: string;
  sourceUrl?: string;
  scrapedAt: string;
  rank: number;
};

type FetchOutput = {
  generatedAt: string;
  source: "tesco-playwright";
  ingredientSource: { type: "file"; path: string } | { type: IngredientSource };
  products: TescoProductCandidate[];
  failures: Array<{ ingredient: string; error: string }>;
  completedIngredients: string[];
};

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
  sessionId?: string;
};

type CdpClient = {
  send<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  close(): void;
};

type CdpPage = {
  client: CdpClient;
  sessionId: string;
};

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const source = (option("--source") ?? "recommender") as IngredientSource;
const ingredientsFile = option("--ingredients-file");
const outputPath = option("--out") ?? "data/raw/tesco-products.json";
const baseUrl = recommenderUrl(option("--recommender-url"));
const limit = Number(option("--limit") ?? Number.POSITIVE_INFINITY);
const productsPerIngredient = Number(option("--products-per-ingredient") ?? 3);
const scanProductsPerIngredient = Number(option("--scan-products-per-ingredient") ?? 24);
const delayMs = Number(option("--delay-ms") ?? 1500);
const headless = !flag("--headful");
const browserName = (option("--browser") ?? "chromium") as BrowserName;
const cdpUrl = option("--cdp-url");
const chromiumExecutablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
const firefoxExecutablePath = process.env["PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH"];
const userDataDir = option("--user-data-dir");
const launchTimeoutMs = Number(option("--launch-timeout-ms") ?? 30_000);
const manualTimeoutMs = Number(option("--manual-timeout-ms") ?? 120_000);

function usageError(message: string): never {
  throw new Error(`${message}

Usage:
  TESCO_PRICE_FETCH_ACCEPT_TERMS=1 bun scripts/fetch-tesco-prices.ts [options]

Options:
  --source recommender|firestore      Ingredient source (default recommender)
  --ingredients-file <path>           Override DB source with ingredient list
  --recommender-url <url>             Override RECOMMENDER_API_URL
  --out <path>                        Output JSON path (default data/raw/tesco-products.json)
  --browser chromium|firefox          Browser engine (default chromium)
  --products-per-ingredient <n>       Candidates to keep per ingredient (default 3)
  --scan-products-per-ingredient <n>  Product cards to inspect before ranking (default 24)
  --limit <n>                         Limit ingredients for test runs
  --delay-ms <n>                      Delay between searches (default 1500)
  --headful                           Show browser for debugging/manual checks
  --user-data-dir <path>              Reuse a persistent browser profile/cookies
  --cdp-url <url>                     Attach to user-launched Chrome/Chromium over CDP
  --launch-timeout-ms <n>             Browser launch timeout (default 30000)
  --manual-timeout-ms <n>             Time to wait for manual Access Denied fixes (default 120000)

Firefox notes:
  Playwright cannot attach to a normally launched Firefox profile in the same
  way it can attach to Chrome/Chromium over CDP. Use Playwright's Firefox build
  without PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH, or use --browser chromium --cdp-url
  with a user-launched Chrome/Chromium profile.
`);
}

function normalizeIngredientName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parsePricePence(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  const pounds = normalized.match(/£\s*(\d+(?:\.\d{1,2})?)/);
  if (pounds) return Math.round(Number(pounds[1]) * 100);

  const pence = normalized.match(/\b(\d+(?:\.\d+)?)\s*p\b/i);
  if (pence) return Math.round(Number(pence[1]));

  return null;
}

function isBrowserClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /target page, context or browser has been closed|browser has been closed|context has been closed/i.test(message);
}

async function readIngredientFile(filePath: string): Promise<string[]> {
  const text = await Bun.file(filePath).text();
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) usageError("--ingredients-file JSON must be an array of strings.");
    return parsed.filter((item): item is string => typeof item === "string");
  }

  return trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function ingredientsFromRecommender(): Promise<string[]> {
  const recipes = await listRecipes(baseUrl);
  return recipes.flatMap((recipe) => recipe.ingredients ?? []).map((ingredient) => ingredient.name);
}

async function ingredientsFromFirestore(): Promise<string[]> {
  initFirebase();
  const snapshot = await getFirestore().collection("recipes").get();
  const names: string[] = [];

  for (const doc of snapshot.docs) {
    const ingredients = doc.get("ingredients") as Ingredient[] | undefined;
    if (!Array.isArray(ingredients)) continue;
    for (const ingredient of ingredients) {
      if (typeof ingredient?.name === "string") names.push(ingredient.name);
    }
  }

  return names;
}

async function loadIngredients(): Promise<string[]> {
  const raw = ingredientsFile
    ? await readIngredientFile(ingredientsFile)
    : source === "firestore"
      ? await ingredientsFromFirestore()
      : await ingredientsFromRecommender();

  return [...new Set(raw.map(normalizeIngredientName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, Number.isFinite(limit) ? limit : undefined);
}

async function readExistingOutput(filePath: string): Promise<FetchOutput | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  const parsed = JSON.parse(await file.text()) as Partial<FetchOutput>;
  if (!Array.isArray(parsed.products) || !Array.isArray(parsed.failures)) return null;

  return {
    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date().toISOString(),
    source: "tesco-playwright",
    ingredientSource: parsed.ingredientSource as FetchOutput["ingredientSource"] ?? { type: source },
    products: parsed.products,
    failures: parsed.failures,
    completedIngredients: Array.isArray(parsed.completedIngredients)
      ? parsed.completedIngredients.filter((ingredient): ingredient is string => typeof ingredient === "string")
      : [
          ...new Set([
            ...parsed.products.map((product) => product.searchIngredient),
            ...parsed.failures.map((failure) => failure.ingredient),
          ]),
        ],
  };
}

async function writeOutput(filePath: string, output: FetchOutput): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await Bun.write(filePath, `${JSON.stringify({ ...output, generatedAt: new Date().toISOString() }, null, 2)}\n`);
}

async function acceptCookieBanner(page: Page): Promise<void> {
  const buttons = [
    page.getByRole("button", { name: /accept all/i }),
    page.getByRole("button", { name: /^accept$/i }),
    page.getByRole("button", { name: /allow all/i }),
  ];

  for (const button of buttons) {
    try {
      await button.click({ timeout: 1500 });
      return;
    } catch {
      // Try the next common banner label.
    }
  }
}

async function pageIsAccessDenied(page: Page): Promise<boolean> {
  const pageTitle = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
  return /access denied/i.test(pageTitle) || /access denied/i.test(bodyText);
}

async function waitForManualAccess(page: Page, ingredient: string): Promise<void> {
  if (headless) {
    throw new Error(
      "Tesco returned Access Denied. Re-run with --headful --user-data-dir <local-profile-dir> and complete any browser checks manually.",
    );
  }

  console.log(
    `\nTesco returned Access Denied while searching "${ingredient}". ` +
      "Use the open browser window to complete any checks, accept cookies, or set location. Waiting...",
  );

  const deadline = Date.now() + manualTimeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    if (!(await pageIsAccessDenied(page))) return;
  }

  throw new Error(
    `Tesco still returned Access Denied after ${Math.round(manualTimeoutMs / 1000)}s. ` +
      "Try a different --user-data-dir after opening Tesco normally in that profile, or use a non-Playwright export/provider.",
  );
}

async function connectRawCdp(endpoint: string): Promise<CdpPage> {
  const version = await fetch(new URL("/json/version", endpoint)).then((response) => response.json()) as {
    webSocketDebuggerUrl?: string;
  };
  if (!version.webSocketDebuggerUrl) usageError(`No CDP WebSocket debugger URL found at ${endpoint}.`);

  const socket = new WebSocket(version.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  const opened = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${version.webSocketDebuggerUrl}`)), launchTimeoutMs);
    socket.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to connect to ${version.webSocketDebuggerUrl}`));
    };
  });

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) {
      handler.reject(new Error(message.error.message ?? "CDP command failed"));
    } else {
      handler.resolve(message.result);
    }
  };

  await opened;

  const client: CdpClient = {
    send<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
      const id = nextId++;
      const payload = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: (value) => resolve(value as T), reject });
        socket.send(payload);
      });
    },
    close() {
      socket.close();
    },
  };

  const target = await client.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const attached = await client.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  await client.send("Page.enable", {}, attached.sessionId);
  await client.send("Runtime.enable", {}, attached.sessionId);

  return { client, sessionId: attached.sessionId };
}

async function cdpEvaluate<T>(page: CdpPage, expression: string): Promise<T> {
  const result = await page.client.send<{
    result?: { value?: T };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  }>(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    page.sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "CDP evaluation failed");
  }
  return result.result?.value as T;
}

async function cdpGoto(page: CdpPage, url: string): Promise<void> {
  await page.client.send("Page.navigate", { url }, page.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 8_000));
}

async function acceptCookieBannerCdp(page: CdpPage): Promise<void> {
  await cdpEvaluate<boolean>(
    page,
    `(() => {
      const labels = [/accept all/i, /^accept$/i, /allow all/i];
      for (const button of document.querySelectorAll("button")) {
        const text = (button.textContent || "").replace(/\\s+/g, " ").trim();
        if (labels.some((label) => label.test(text))) {
          button.click();
          return true;
        }
      }
      return false;
    })()`,
  ).catch(() => false);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

async function pageIsAccessDeniedCdp(page: CdpPage): Promise<boolean> {
  return cdpEvaluate<boolean>(
    page,
    `(() => {
      const title = document.title || "";
      const body = document.body?.innerText || "";
      return /access denied/i.test(title) || /access denied/i.test(body);
    })()`,
  ).catch(() => false);
}

async function waitForManualAccessCdp(page: CdpPage, ingredient: string): Promise<void> {
  console.log(
    `\nTesco returned Access Denied while searching "${ingredient}". ` +
      "Use the open Chrome window to complete any checks, accept cookies, or set location. Waiting...",
  );

  const deadline = Date.now() + manualTimeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (!(await pageIsAccessDeniedCdp(page))) return;
  }

  throw new Error(`Tesco still returned Access Denied after ${Math.round(manualTimeoutMs / 1000)}s.`);
}

async function searchTesco(page: Page, ingredient: string): Promise<TescoProductCandidate[]> {
  const url = `https://www.tesco.com/shop/en-GB/search?query=${encodeURIComponent(ingredient)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await acceptCookieBanner(page);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  if (await pageIsAccessDenied(page)) {
    await waitForManualAccess(page, ingredient);
  }

  const scrapedAt = new Date().toISOString();
  const candidates = await page.evaluate(
    ({ searchIngredient, scrapedAtValue, maxProducts, scanProducts }) => {
      function clean(value: string | null | undefined): string {
        return (value ?? "").replace(/\s+/g, " ").trim();
      }

      function pricePence(value: string): number | null {
        const pounds = value.match(/£\s*(\d+(?:\.\d{1,2})?)/);
        if (pounds) return Math.round(Number(pounds[1]) * 100);
        const pence = value.match(/\b(\d+(?:\.\d+)?)\s*p\b/i);
        if (pence) return Math.round(Number(pence[1]));
        return null;
      }

      function productNameFor(node: Element): string {
        const selectors = [
          "h3",
          "h2",
          "[data-auto='product-tile--title']",
          "[data-testid*='title']",
          "a[href*='/products/']",
        ];
        for (const selector of selectors) {
          const text = clean(node.querySelector(selector)?.textContent);
          if (text && !/£\s*\d/.test(text)) return text;
        }
        return "";
      }

      function productUrlFor(node: Element): string | undefined {
        const anchor = node.querySelector("a[href*='/products/']") as HTMLAnchorElement | null;
        if (!anchor?.href) return undefined;
        return anchor.href;
      }

      function isMarketplaceProduct(productName: string, sourceUrl?: string): boolean {
        return /^more from marketplace$/i.test(productName) || /[?&]seller=|\/marketplace\//i.test(sourceUrl ?? "");
      }

      function unitPriceFor(text: string): { text: string; basis: string; preferred: boolean } | undefined {
        const match = text.match(/(?:£\s*\d+(?:\.\d{1,2})?|\b\d+(?:\.\d+)?p)\s*\/\s*(100g|kg|g|100ml|l|litre|liter|each)/i);
        if (!match) return undefined;
        const basis = match[1]?.toLowerCase() ?? "";
        return {
          text: clean(match[0]),
          basis,
          preferred: ["kg", "100g", "g", "l", "litre", "liter", "100ml"].includes(basis),
        };
      }

      const list = document.querySelector("#list-content");
      const nodes = [
        ...(list ? [...list.querySelectorAll("li")] : []),
        ...document.querySelectorAll("article, [data-auto*='product'], [data-testid*='product']"),
      ];
      const products: Array<{
        searchIngredient: string;
        productId?: string;
        productName: string;
        price: string;
        pricePence: number;
        unitPriceText?: string;
        unitPriceBasis?: string;
        preferredUnitPrice: boolean;
        packageSize?: string;
        sourceUrl?: string;
        scrapedAt: string;
        rank: number;
      }> = [];
      const seen = new Set<string>();

      for (const node of nodes) {
        const text = clean((node as HTMLElement).innerText);
        if (!text || !/£\s*\d/.test(text)) continue;

        const productName = productNameFor(node);
        const priceMatch = text.match(/£\s*\d+(?:\.\d{1,2})?/);
        const unitPrice = unitPriceFor(text);
        const packageMatch = productName.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|litre|liter|oz|lb|pint)\b/i);
        const price = clean(priceMatch?.[0]);
        const parsedPrice = pricePence(price);
        const sourceUrl = productUrlFor(node);
        const productId = sourceUrl?.match(/products\/(\d+)/)?.[1];
        const key = productId ?? `${productName}:${price}`;

        if (!productName || isMarketplaceProduct(productName, sourceUrl) || parsedPrice === null || seen.has(key)) continue;
        seen.add(key);
        products.push({
          searchIngredient,
          ...(productId ? { productId } : {}),
          productName,
          price,
          pricePence: parsedPrice,
          ...(unitPrice ? { unitPriceText: unitPrice.text, unitPriceBasis: unitPrice.basis } : {}),
          preferredUnitPrice: unitPrice?.preferred ?? false,
          ...(packageMatch ? { packageSize: clean(packageMatch[0]) } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
          scrapedAt: scrapedAtValue,
          rank: products.length + 1,
        });
        if (products.length >= scanProducts) break;
      }

      return products
        .sort((a, b) => Number(b.preferredUnitPrice) - Number(a.preferredUnitPrice) || a.rank - b.rank)
        .slice(0, maxProducts)
        .map((product, index) => ({ ...product, rank: index + 1 }));
    },
    {
      searchIngredient: ingredient,
      scrapedAtValue: scrapedAt,
      maxProducts: productsPerIngredient,
      scanProducts: scanProductsPerIngredient,
    },
  );

  return candidates
    .map((candidate) => ({ ...candidate, pricePence: parsePricePence(candidate.price) ?? candidate.pricePence }))
    .filter((candidate) => candidate.pricePence > 0);
}

async function searchTescoCdp(page: CdpPage, ingredient: string): Promise<TescoProductCandidate[]> {
  const url = `https://www.tesco.com/shop/en-GB/search?query=${encodeURIComponent(ingredient)}`;
  await cdpGoto(page, url);
  await acceptCookieBannerCdp(page);

  if (await pageIsAccessDeniedCdp(page)) {
    await waitForManualAccessCdp(page, ingredient);
  }

  const scrapedAt = new Date().toISOString();
  const candidates = await cdpEvaluate<TescoProductCandidate[]>(
    page,
    `(({ searchIngredient, scrapedAtValue, maxProducts, scanProducts }) => {
      function clean(value) {
        return (value || "").replace(/\\s+/g, " ").trim();
      }

      function pricePence(value) {
        const pounds = value.match(/£\\s*(\\d+(?:\\.\\d{1,2})?)/);
        if (pounds) return Math.round(Number(pounds[1]) * 100);
        const pence = value.match(/\\b(\\d+(?:\\.\\d+)?)\\s*p\\b/i);
        if (pence) return Math.round(Number(pence[1]));
        return null;
      }

      function productNameFor(node) {
        const selectors = [
          "h3",
          "h2",
          "[data-auto='product-tile--title']",
          "[data-testid*='title']",
          "a[href*='/products/']",
        ];
        for (const selector of selectors) {
          const text = clean(node.querySelector(selector)?.textContent);
          if (text && !/£\\s*\\d/.test(text)) return text;
        }
        return "";
      }

      function productUrlFor(node) {
        const anchor = node.querySelector("a[href*='/products/']");
        if (!anchor?.href) return undefined;
        return anchor.href;
      }

      function isMarketplaceProduct(productName, sourceUrl) {
        return /^more from marketplace$/i.test(productName) || /[?&]seller=|\\/marketplace\\//i.test(sourceUrl || "");
      }

      function unitPriceFor(text) {
        const match = text.match(/(?:£\\s*\\d+(?:\\.\\d{1,2})?|\\b\\d+(?:\\.\\d+)?p)\\s*\\/\\s*(100g|kg|g|100ml|l|litre|liter|each)/i);
        if (!match) return undefined;
        const basis = (match[1] || "").toLowerCase();
        return {
          text: clean(match[0]),
          basis,
          preferred: ["kg", "100g", "g", "l", "litre", "liter", "100ml"].includes(basis),
        };
      }

      const list = document.querySelector("#list-content");
      const nodes = [
        ...(list ? [...list.querySelectorAll("li")] : []),
        ...document.querySelectorAll("article, [data-auto*='product'], [data-testid*='product']"),
      ];
      const products = [];
      const seen = new Set();

      for (const node of nodes) {
        const text = clean(node.innerText);
        if (!text || !/£\\s*\\d/.test(text)) continue;

        const productName = productNameFor(node);
        const priceMatch = text.match(/£\\s*\\d+(?:\\.\\d{1,2})?/);
        const unitPrice = unitPriceFor(text);
        const packageMatch = productName.match(/\\b\\d+(?:\\.\\d+)?\\s*(?:kg|g|ml|l|litre|liter|oz|lb|pint)\\b/i);
        const price = clean(priceMatch?.[0]);
        const parsedPrice = pricePence(price);
        const sourceUrl = productUrlFor(node);
        const productId = sourceUrl?.match(/products\\/(\\d+)/)?.[1];
        const key = productId || \`\${productName}:\${price}\`;

        if (!productName || isMarketplaceProduct(productName, sourceUrl) || parsedPrice === null || seen.has(key)) continue;
        seen.add(key);
        products.push({
          searchIngredient,
          ...(productId ? { productId } : {}),
          productName,
          price,
          pricePence: parsedPrice,
          ...(unitPrice ? { unitPriceText: unitPrice.text, unitPriceBasis: unitPrice.basis } : {}),
          preferredUnitPrice: unitPrice?.preferred || false,
          ...(packageMatch ? { packageSize: clean(packageMatch[0]) } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
          scrapedAt: scrapedAtValue,
          rank: products.length + 1,
        });
        if (products.length >= scanProducts) break;
      }

      return products
        .sort((a, b) => Number(b.preferredUnitPrice) - Number(a.preferredUnitPrice) || a.rank - b.rank)
        .slice(0, maxProducts)
        .map((product, index) => ({ ...product, rank: index + 1 }));
    })(${JSON.stringify({
      searchIngredient: ingredient,
      scrapedAtValue: scrapedAt,
      maxProducts: productsPerIngredient,
      scanProducts: scanProductsPerIngredient,
    })})`,
  );

  return candidates
    .map((candidate) => ({ ...candidate, pricePence: parsePricePence(candidate.price) ?? candidate.pricePence }))
    .filter((candidate) => candidate.pricePence > 0);
}

async function main() {
  if (process.env["TESCO_PRICE_FETCH_ACCEPT_TERMS"] !== "1") {
    usageError(
      "Set TESCO_PRICE_FETCH_ACCEPT_TERMS=1 after confirming you are allowed to collect Tesco page data for this use.",
    );
  }
  if (!["recommender", "firestore"].includes(source)) {
    usageError("--source must be recommender or firestore.");
  }
  if (!["chromium", "firefox"].includes(browserName)) {
    usageError("--browser must be chromium or firefox.");
  }
  if (cdpUrl && browserName !== "chromium") {
    usageError("--cdp-url only works with --browser chromium because Firefox does not expose a Playwright-compatible attach endpoint.");
  }
  if (cdpUrl && userDataDir) {
    usageError("Do not pass --user-data-dir with --cdp-url. Launch Chrome/Chromium yourself with the desired profile, then attach to its CDP URL.");
  }
  if (browserName === "firefox" && firefoxExecutablePath) {
    console.warn(
      "Warning: PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH is set. Normal Firefox binaries can open a window but fail to connect to Playwright. " +
        "Unset it unless this points at a Playwright-compatible Firefox build.",
    );
  }

  const ingredients = await loadIngredients();
  console.log("=== Tesco Browser Price Fetch ===");
  console.log(`  ingredient source  ${ingredientsFile ? ingredientsFile : source}`);
  console.log(`  browser            ${browserName}`);
  console.log(`  ingredients        ${ingredients.length}`);
  console.log(`  candidates each    ${productsPerIngredient}`);
  console.log(`  scanned each       ${scanProductsPerIngredient}`);
  console.log(`  output             ${outputPath}`);
  if (ingredients.length === 0) {
    console.log("No ingredients found.");
    return;
  }

  const browserType: BrowserType = browserName === "firefox" ? firefox : chromium;
  const executablePath = browserName === "firefox" ? firefoxExecutablePath : chromiumExecutablePath;
  const launchOptions = {
    headless,
    timeout: launchTimeoutMs,
    ...(executablePath ? { executablePath } : {}),
  };
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let cdpPage: CdpPage | null = null;

  if (cdpUrl) {
    cdpPage = await connectRawCdp(cdpUrl);
  } else if (userDataDir) {
    context = await browserType.launchPersistentContext(userDataDir, {
      ...launchOptions,
      locale: "en-GB",
      viewport: { width: 1365, height: 900 },
    });
  } else {
    browser = await browserType.launch(launchOptions);
    context = await browser.newContext({
    locale: "en-GB",
      viewport: { width: 1365, height: 900 },
    });
  }
  if (context) {
    page = context.pages()[0] ?? await context.newPage();
  }

  const existing = await readExistingOutput(outputPath);
  const output: FetchOutput = existing ?? {
    generatedAt: new Date().toISOString(),
    source: "tesco-playwright",
    ingredientSource: ingredientsFile ? { type: "file", path: ingredientsFile } : { type: source },
    products: [],
    failures: [],
    completedIngredients: [],
  };
  const completed = new Set(output.completedIngredients);
  if (completed.size > 0) {
    console.log(`  resume             ${completed.size} already completed`);
  }

  try {
    for (const [index, ingredient] of ingredients.entries()) {
      if (completed.has(ingredient)) continue;
      process.stdout.write(`  [${index + 1}/${ingredients.length}] ${ingredient.padEnd(35)}\r`);
      try {
        const products = cdpPage ? await searchTescoCdp(cdpPage, ingredient) : await searchTesco(page as Page, ingredient);
        output.products.push(...products);
      } catch (error) {
        if (isBrowserClosedError(error)) {
          throw error;
        }
        output.failures.push({ ingredient, error: (error as Error).message });
      }
      output.completedIngredients.push(ingredient);
      completed.add(ingredient);
      await writeOutput(outputPath, output);
      if (delayMs > 0 && index < ingredients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } finally {
    await context?.close();
    cdpPage?.client.close();
    await browser?.close();
  }

  process.stdout.write("\n");
  await writeOutput(outputPath, output);

  console.log("\n=== Summary ===");
  console.log(`  ingredients searched  ${ingredients.length}`);
  console.log(`  products captured     ${output.products.length}`);
  console.log(`  failures              ${output.failures.length}`);
  console.log(`  wrote                 ${outputPath}`);
  console.log("\nNext:");
  console.log(`  bun run prices:import-tesco -- --input ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
