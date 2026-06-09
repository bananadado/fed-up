#!/usr/bin/env bun
/**
 * Convert a Tesco/vendor product export into reviewed ingredient price proposals.
 *
 * This does not scrape Tesco and does not mutate the canonical price table. It
 * normalises product prices into pence-per-gram and writes a review file that a
 * maintainer can use to update src/domain/ingredientPrices.ts.
 *
 * Supported inputs:
 *   - JSON array
 *   - JSON object with a `products` array
 *   - JSONL, one product object per line
 *   - CSV with headers
 *
 * Usage:
 *   bun scripts/import-tesco-prices.ts --input data/raw/tesco-products.json --out tmp/tesco-price-proposals.json
 */

import path from "path";

import { findIngredientPriceRecord } from "../src/domain/ingredientCosting.ts";
import { gramsForIngredient, parseMeasureToIngredient } from "../src/domain/ingredientMeasurements.ts";

type RawProduct = Record<string, unknown>;

type TescoPriceProposal = {
  status: "matched" | "review";
  ingredient?: string;
  matchedAlias?: string;
  productId?: string;
  productName: string;
  pricePence: number;
  packageGrams: number;
  pencePerGram: number;
  sourceUrl?: string;
  sourceDate: string;
  postcodeOrStoreId?: string;
  reason?: string;
};

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(name);
}

function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

const inputPath = option("--input");
const outputPath = option("--out") ?? "tmp/tesco-price-proposals.json";
const isDryRun = flag("--dry-run");

function stringField(product: RawProduct, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberField(product: RawProduct, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = parsePrice(value);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

function parsePrice(value: string): number | undefined {
  const normalized = value.trim().toLowerCase().replace(/,/g, "");
  const money = normalized.match(/£\s*(\d+(?:\.\d+)?)/);
  if (money) return Math.round(Number(money[1]) * 100);

  const pence = normalized.match(/(\d+(?:\.\d+)?)\s*p\b/);
  if (pence) return Math.round(Number(pence[1]));

  const numeric = Number(normalized.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;

  return numeric > 20 ? Math.round(numeric) : Math.round(numeric * 100);
}

function parsePackageGrams(productName: string, rawSize?: string): number | undefined {
  const candidates = [rawSize, productName].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const match = candidate.match(/(\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*(kg|g|ml|l|litre|liter|oz|lb|pound|pint)\b/i);
    if (!match) continue;
    const parsed = parseMeasureToIngredient(productName, `${match[1]} ${match[2]}`);
    return gramsForIngredient(parsed);
  }

  return undefined;
}

function parseUnitPrice(product: RawProduct): { pencePerGram: number; packageGrams?: number } | undefined {
  const text = stringField(product, ["unitPriceText", "unit_price", "unitPrice", "pricePerUnit"]);
  if (!text) return undefined;

  const match = text.match(/(?:£\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*p)\s*\/\s*(100g|kg|g|100ml|l|litre|liter|each)/i);
  if (!match) return undefined;

  const pence = match[1] ? Number(match[1]) * 100 : Number(match[2]);
  const basis = match[3]?.toLowerCase();
  if (!Number.isFinite(pence) || !basis || basis === "each") return undefined;

  const grams = basis === "100g" || basis === "100ml" ? 100 : basis === "kg" || basis === "l" || basis === "litre" || basis === "liter" ? 1000 : 1;
  return { pencePerGram: pence / grams };
}

function csvRows(text: string): RawProduct[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...data] = rows.filter((r) => r.some((c) => c.trim()));
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

async function readProducts(filePath: string): Promise<RawProduct[]> {
  const text = await Bun.file(filePath).text();
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") return csvRows(text);
  if (ext === ".jsonl") return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as RawProduct);

  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed.filter((p): p is RawProduct => p !== null && typeof p === "object" && !Array.isArray(p));
  if (parsed !== null && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products)) {
    return (parsed as { products: unknown[] }).products.filter((p): p is RawProduct => p !== null && typeof p === "object" && !Array.isArray(p));
  }

  throw new Error("Input must be a JSON array, an object with products[], JSONL, or CSV.");
}

function proposalForProduct(product: RawProduct): TescoPriceProposal | null {
  const productName = stringField(product, ["productName", "name", "title", "product_name"]);
  const pricePence = numberField(product, ["pricePence", "price", "priceText", "currentPrice"]);
  if (!productName || pricePence === undefined) return null;

  const unitPrice = parseUnitPrice(product);
  const rawSize = stringField(product, ["packageSize", "size", "weight", "contents"]);
  const packageGrams = numberField(product, ["packageGrams", "grams"]) ?? parsePackageGrams(productName, rawSize);
  const pencePerGram = unitPrice?.pencePerGram ?? (packageGrams ? pricePence / packageGrams : undefined);
  if (pencePerGram === undefined || !Number.isFinite(pencePerGram) || pencePerGram <= 0) {
    return {
      status: "review",
      productName,
      pricePence,
      packageGrams: packageGrams ?? 0,
      pencePerGram: 0,
      sourceDate: stringField(product, ["scrapedAt", "sourceDate", "timestamp"]) ?? new Date().toISOString(),
      reason: "Could not derive package grams or unit price.",
    };
  }

  const match = findIngredientPriceRecord(productName);
  return {
    status: match ? "matched" : "review",
    ...(match ? { ingredient: match.ingredient, matchedAlias: match.aliases.find((alias) => productName.toLowerCase().includes(alias)) ?? match.ingredient } : {}),
    productId: stringField(product, ["productId", "id", "sku", "tpnb", "gtin"]),
    productName,
    pricePence,
    packageGrams: packageGrams ?? unitPrice?.packageGrams ?? 0,
    pencePerGram: Number(pencePerGram.toFixed(6)),
    sourceUrl: stringField(product, ["sourceUrl", "url", "productUrl"]),
    sourceDate: stringField(product, ["scrapedAt", "sourceDate", "timestamp"]) ?? new Date().toISOString(),
    postcodeOrStoreId: stringField(product, ["postcode", "storeId", "location"]),
    ...(match ? {} : { reason: "No existing ingredient alias matched this product." }),
  };
}

async function main() {
  if (!inputPath) {
    throw new Error("Missing --input <path>");
  }

  const products = await readProducts(inputPath);
  const proposals = products.map(proposalForProduct).filter((p): p is TescoPriceProposal => p !== null);
  const matched = proposals.filter((p) => p.status === "matched").length;
  const review = proposals.length - matched;

  console.log("=== Tesco Price Import Review ===");
  console.log(`  input products    ${products.length}`);
  console.log(`  usable products   ${proposals.length}`);
  console.log(`  matched           ${matched}`);
  console.log(`  needs review      ${review}`);

  if (isDryRun) {
    console.log("\nDry run complete — no proposal file written.");
    return;
  }

  await Bun.write(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), proposals }, null, 2)}\n`);
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
