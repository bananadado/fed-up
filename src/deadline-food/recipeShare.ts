// Public, URL-safe share slugs for recipes (#213).
//
// A recipe's share id is a deterministic hash of its canonical id, so the same
// recipe always produces the same shareable link and the client can build (and
// match) a link synchronously without a server round-trip. The algorithm MUST
// stay in lockstep with `shareIdForRecipe()` in functions/src/index.ts so a link
// minted on one side resolves on the other.

/**
 * cyrb53 — a fast, well-distributed 53-bit string hash. Deterministic and
 * dependency-free, so the identical implementation runs on the Node functions
 * side. 53 bits keeps collisions negligible at our recipe counts while staying
 * exactly representable as a JS number.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Deterministic, URL-safe share slug for a recipe id. */
export function shareIdForRecipe(recipeId: string): string {
  return cyrb53(recipeId).toString(36);
}

/** Parse `#/recipe/<token>` from a hash string, returning the token or null. */
export function recipeShareToken(hash: string): string | null {
  const match = hash.match(/^#\/recipe\/([A-Za-z0-9_-]{1,80})$/);
  return match?.[1] ?? null;
}

/** Absolute, shareable URL for a recipe share id. */
export function recipeShareUrl(shareId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/#/recipe/${shareId}`;
}
