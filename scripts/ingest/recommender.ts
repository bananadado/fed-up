/**
 * Minimal client for the pgvector recommender API.
 *
 * The recommender is the canonical full-recipe store (RecipeOut carries every
 * RecipeIn field plus a derived difficulty), so the nutrition scripts read the
 * recipe list from here and write recomputed nutrition back via /recipes/bulk.
 *
 * Every endpoint except the public ones requires the shared API key header, so
 * we attach it to both GET and POST when RECOMMENDER_API_KEY is set.
 */

import type { RecipeIn } from "./types.ts";

export type RecipeOut = RecipeIn & {
  difficulty?: number;
  embedding_text?: string | null;
};

const API_KEY_HEADER = "X-Deadline-Food-API-Key";
const BULK_CHUNK = 20;

export function recommenderUrl(override?: string): string {
  return (
    override ??
    process.env["RECOMMENDER_API_URL"] ??
    "http://gru.end-pickerel.ts.net:8100"
  ).replace(/\/$/, "");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env["RECOMMENDER_API_KEY"] ?? "";
  return { ...extra, ...(key ? { [API_KEY_HEADER]: key } : {}) };
}

export async function listRecipes(baseUrl: string): Promise<RecipeOut[]> {
  const res = await fetch(`${baseUrl}/recipes`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Recommender GET /recipes failed ${res.status}: ${body}`);
  }
  return (await res.json()) as RecipeOut[];
}

export async function deleteRecipe(baseUrl: string, recipeId: string): Promise<void> {
  const res = await fetch(`${baseUrl}/recipes/${encodeURIComponent(recipeId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Recommender DELETE /recipes/${recipeId} failed ${res.status}: ${body}`);
  }
}

/** Upsert recipes in chunks. `onProgress` reports cumulative written count. */
export async function bulkUpsertRecipes(
  baseUrl: string,
  recipes: RecipeIn[],
  onProgress?: (written: number, total: number) => void,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < recipes.length; i += BULK_CHUNK) {
    const chunk = recipes.slice(i, i + BULK_CHUNK);
    const res = await fetch(`${baseUrl}/recipes/bulk`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Recommender POST /recipes/bulk failed ${res.status}: ${body}`);
    }
    const result = (await res.json()) as unknown[];
    written += result.length;
    onProgress?.(written, recipes.length);
  }
  return written;
}
