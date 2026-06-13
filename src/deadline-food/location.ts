import { deadlineFoodEndpointUrl } from "@/adapters/deadlineFoodApi";

import { groceryVendorById } from "./shopping";

// Shape returned by the deadlineFoodNearbyStores backend function (issue #272).
// `ok: false` covers an invalid/unknown postcode or no supported chain nearby —
// callers treat it as "no location signal" and fall back to defaults.

export type NearbyStore = {
  vendorId: string;
  name: string;
  distanceMeters: number;
};

export type NearbyStoresResponse =
  | { ok: false }
  | {
      ok: true;
      nearestVendorId: string;
      nearestStore: { vendorId: string; name: string; distanceMeters: number; lat: number; lng: number };
      stores: NearbyStore[];
      location: { latitude: number; longitude: number; region: string | null; adminDistrict: string | null };
    };

/**
 * Look up the nearest big-supermarket chain for a postcode. The postcode is sent
 * to the backend (never logged client-side); only the derived vendor and coarse
 * location come back. Returns `{ ok: false }` for blank/unknown postcodes.
 */
export async function fetchNearbyStores(postcode: string, signal?: AbortSignal): Promise<NearbyStoresResponse> {
  const trimmed = postcode.trim();
  if (!trimmed) {
    return { ok: false };
  }

  const response = await fetch(deadlineFoodEndpointUrl("nearbyStores"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postcode: trimmed }),
    signal,
  });

  if (!response.ok) {
    return { ok: false };
  }

  const payload = (await response.json()) as NearbyStoresResponse;
  // Guard against a resolved vendor id we no longer ship in groceryVendors.
  if (payload.ok && groceryVendorById(payload.nearestVendorId).id !== payload.nearestVendorId) {
    return { ok: false };
  }
  return payload;
}

/**
 * Human-readable distance for the nearest-store hint, e.g. "0.4 mi" or "250 m".
 */
export function formatStoreDistance(distanceMeters: number): string {
  const miles = distanceMeters / 1609.34;
  if (miles >= 0.1) {
    return `${miles.toFixed(1)} mi`;
  }
  return `${Math.round(distanceMeters / 10) * 10} m`;
}
