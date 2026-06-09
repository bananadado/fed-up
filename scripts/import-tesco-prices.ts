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
 *   bun scripts/import-tesco-prices.ts --input data/raw/tesco-products.json --update-price-table
 */

import path from "path";

import { findIngredientPriceRecord } from "../src/domain/ingredientCosting.ts";
import { gramsForIngredient, parseMeasureToIngredient } from "../src/domain/ingredientMeasurements.ts";

type RawProduct = Record<string, unknown>;

type TescoPriceProposal = {
  status: "matched" | "review";
  ingredient?: string;
  matchedAlias?: string;
  searchIngredient?: string;
  productId?: string;
  productName: string;
  pricePence: number;
  packageGrams: number;
  pencePerGram: number;
  preferredUnitPrice?: boolean;
  rank?: number;
  sourceUrl?: string;
  sourceDate: string;
  postcodeOrStoreId?: string;
  selectedForIngredient?: boolean;
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
const priceTableOutputPath = option("--price-table-out") ?? "src/domain/generatedTescoIngredientPrices.ts";
const isDryRun = flag("--dry-run");
const shouldUpdatePriceTable = flag("--update-price-table");

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

function isMarketplaceProduct(product: RawProduct): boolean {
  const productName = stringField(product, ["productName", "name", "title", "product_name"]);
  const sourceUrl = stringField(product, ["sourceUrl", "url", "productUrl"]);
  return (productName !== undefined && /^more from marketplace$/i.test(productName))
    || (sourceUrl !== undefined && /[?&]seller=|\/marketplace\//i.test(sourceUrl));
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

function estimateReviewPackageGrams(productName: string, searchIngredient?: string): number | undefined {
  const productText = productName.toLowerCase();
  const text = `${productText} ${searchIngredient ?? ""}`.toLowerCase();
  const packCount = productName.match(/\b(\d+)\s*(?:pack|roll|rolls|stems)\b/i)
    ?? productName.match(/\b(\d+)\s+.*\b(?:buns?|muffins?|eggs?)\b/i);
  const count = packCount ? Number(packCount[1]) : undefined;

  if (/medium pot/.test(text) && /\b(?:basil|thyme|herb)\b/.test(text)) return 30;
  if (/beef tomato/.test(productText)) return 180;
  if (/bramley apple pies/.test(productText)) return count ? count * 50 : 300;
  if (/bramley apple pie/.test(productText)) return 500;
  if (/kitchen roll/.test(productText)) return count ? count * 250 : 500;
  if (/\b(?:bun|buns|burger buns|rolls?)\b/.test(productText)) return count ? count * 75 : 75;
  if (/muffins?/.test(productText)) return count ? count * 65 : 260;
  if (/fennel/.test(productText)) return 250;
  if (/celeriac/.test(productText)) return 700;
  if (/chinese leaf|chinese cabbage/.test(productText)) return 700;
  if (/chicory/.test(productText)) return 160;
  if (/corn on the cob twinpack/.test(productText)) return 360;
  if (/cobettes/.test(productText)) return count ? count * 100 : 400;
  if (/courgettes?|zucchini/.test(productText)) return count ? count * 160 : 500;
  if (/aubergine|egg plants?/.test(productText)) return 300;
  if (/\begg/.test(productText) && count) return count * 58;
  if (/pretzel roll/.test(productText)) return 220;
  if (/large garlic|garlic bulb/.test(productText)) return 80;
  if (/\b(?:green|yellow) peppers?\b/.test(productText)) return 160;
  if (/lemongrass/.test(productText)) return count ? count * 15 : 30;
  if (/little gem/.test(productText)) return /twin pack/.test(productText) ? 300 : 150;
  if (/savoy cabbage/.test(productText)) return 800;
  if (/white cabbage/.test(productText)) return 900;
  if (/\bswede\b/.test(productText) || /turnips?/.test(text)) return 700;

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
  if (isMarketplaceProduct(product)) return null;

  const productName = stringField(product, ["productName", "name", "title", "product_name"]);
  const pricePence = numberField(product, ["pricePence", "price", "priceText", "currentPrice"]);
  if (!productName || pricePence === undefined) return null;

  const searchIngredient = stringField(product, ["searchIngredient", "ingredient", "query"]);
  const unitPrice = parseUnitPrice(product);
  const rawSize = stringField(product, ["packageSize", "size", "weight", "contents"]);
  const packageGrams = numberField(product, ["packageGrams", "grams"]) ?? parsePackageGrams(productName, rawSize);
  const pencePerGram = unitPrice?.pencePerGram ?? (packageGrams ? pricePence / packageGrams : undefined);
  if (pencePerGram === undefined || !Number.isFinite(pencePerGram) || pencePerGram <= 0) {
    const reviewPackageGrams = packageGrams ?? estimateReviewPackageGrams(productName, searchIngredient);
    const reviewPencePerGram = reviewPackageGrams ? pricePence / reviewPackageGrams : 0;
    return {
      status: "review",
      productName,
      pricePence,
      packageGrams: reviewPackageGrams ?? 0,
      pencePerGram: Number(reviewPencePerGram.toFixed(6)),
      ...(searchIngredient ? { searchIngredient } : {}),
      sourceDate: stringField(product, ["scrapedAt", "sourceDate", "timestamp"]) ?? new Date().toISOString(),
      reason: reviewPackageGrams
        ? "Estimated package grams from product wording; manual review required."
        : "Could not derive package grams or unit price.",
    };
  }

  const match = findIngredientPriceRecord(productName);
  const ingredient = searchIngredient ?? match?.ingredient;
  return {
    status: ingredient ? "matched" : "review",
    ...(ingredient ? { ingredient } : {}),
    ...(match ? { matchedAlias: match.aliases.find((alias) => productName.toLowerCase().includes(alias)) ?? match.ingredient } : {}),
    ...(searchIngredient ? { searchIngredient } : {}),
    productId: stringField(product, ["productId", "id", "sku", "tpnb", "gtin"]),
    productName,
    pricePence,
    packageGrams: packageGrams ?? unitPrice?.packageGrams ?? 0,
    pencePerGram: Number(pencePerGram.toFixed(6)),
    preferredUnitPrice: product["preferredUnitPrice"] === true,
    rank: numberField(product, ["rank"]),
    sourceUrl: stringField(product, ["sourceUrl", "url", "productUrl"]),
    sourceDate: stringField(product, ["scrapedAt", "sourceDate", "timestamp"]) ?? new Date().toISOString(),
    postcodeOrStoreId: stringField(product, ["postcode", "storeId", "location"]),
    ...(ingredient ? {} : { reason: "No existing ingredient alias matched this product." }),
  };
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function bestProposalForIngredient(proposals: TescoPriceProposal[]): TescoPriceProposal | undefined {
  return proposals
    .filter((proposal) => proposal.status === "matched" && proposal.ingredient && proposal.pencePerGram > 0)
    .sort((a, b) => {
      return a.pencePerGram - b.pencePerGram
        || Number(b.preferredUnitPrice) - Number(a.preferredUnitPrice)
        || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
        || a.productName.localeCompare(b.productName);
    })[0];
}

function dedupeKey(proposal: TescoPriceProposal): string {
  return normalizeAlias(proposal.ingredient ?? proposal.searchIngredient ?? proposal.productName);
}

function bestProposal(proposals: TescoPriceProposal[]): TescoPriceProposal | undefined {
  return proposals
    .filter((proposal) => proposal.pencePerGram > 0)
    .sort((a, b) => {
      return Number(b.status === "matched") - Number(a.status === "matched")
        || a.pencePerGram - b.pencePerGram
        || Number(b.preferredUnitPrice) - Number(a.preferredUnitPrice)
        || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
        || a.productName.localeCompare(b.productName);
    })[0];
}

function markSelectedProposals(proposals: TescoPriceProposal[]): TescoPriceProposal[] {
  const selected = new Set<TescoPriceProposal>();
  for (const group of Map.groupBy(proposals, dedupeKey).values()) {
    const best = bestProposal(group);
    if (best) selected.add(best);
  }
  return proposals.map((proposal) => ({
    ...proposal,
    selectedForIngredient: selected.has(proposal),
  }));
}

function generatedPriceTableSource(proposals: TescoPriceProposal[]): string {
  const grouped = Map.groupBy(
    proposals.filter((proposal) => proposal.status === "matched" && proposal.ingredient),
    (proposal) => proposal.ingredient as string,
  );
  const records = [...grouped.entries()]
    .map(([ingredient, ingredientProposals]) => {
      const best = bestProposalForIngredient(ingredientProposals);
      if (!best) return null;
      const aliases = [
        ingredient,
        best.searchIngredient,
        best.productName,
      ].filter((alias): alias is string => Boolean(alias)).map(normalizeAlias);
      return {
        ingredient: normalizeAlias(ingredient),
        aliases: [...new Set(aliases)],
        pencePerGram: best.pencePerGram,
        packagePricePence: best.pricePence,
        packageGrams: best.packageGrams || undefined,
        source: {
          retailer: "tesco",
          source: best.productName,
          ...(best.sourceUrl ? { sourceUrl: best.sourceUrl } : {}),
          sourceDate: best.sourceDate.slice(0, 10),
          confidence: best.preferredUnitPrice ? "high" : "medium",
        },
      };
    })
    .filter((record): record is NonNullable<typeof record> => record !== null)
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient));

  return `import type { IngredientPriceRecord } from "./ingredientPrices";

// Generated by scripts/import-tesco-prices.ts. Do not edit by hand.
export const tescoIngredientPriceTable: IngredientPriceRecord[] = ${JSON.stringify(records, null, 2)};
`;
}

async function main() {
  if (!inputPath) {
    throw new Error("Missing --input <path>");
  }

  const products = await readProducts(inputPath);
  const skippedMarketplace = products.filter(isMarketplaceProduct).length;
  const proposals = markSelectedProposals(products.map(proposalForProduct).filter((p): p is TescoPriceProposal => p !== null));
  const matched = proposals.filter((p) => p.status === "matched").length;
  const review = proposals.length - matched;
  const selectedProposals = proposals.filter((proposal) => proposal.selectedForIngredient);

  console.log("=== Tesco Price Import Review ===");
  console.log(`  input products    ${products.length}`);
  console.log(`  marketplace skip  ${skippedMarketplace}`);
  console.log(`  usable products   ${proposals.length}`);
  console.log(`  matched           ${matched}`);
  console.log(`  needs review      ${review}`);

  if (isDryRun) {
    console.log("\nDry run complete — no proposal file written.");
    return;
  }

  await Bun.write(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), proposals, selectedProposals }, null, 2)}\n`);
  console.log(`\nWrote ${outputPath}`);

  if (shouldUpdatePriceTable) {
    await Bun.write(priceTableOutputPath, generatedPriceTableSource(proposals));
    console.log(`Updated ${priceTableOutputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
