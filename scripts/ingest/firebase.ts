/**
 * Firebase Admin initialisation shared by the ingestion + nutrition scripts.
 *
 * Credentials (in priority order):
 *   FIREBASE_SERVICE_ACCOUNT_KEY_B64   Base64-encoded service account JSON
 *   GOOGLE_APPLICATION_CREDENTIALS     Path to service account JSON
 *
 * Project id defaults to drp03-50059 (override with FIREBASE_PROJECT_ID).
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const FIREBASE_PROJECT_ID = process.env["FIREBASE_PROJECT_ID"] ?? "drp03-50059";

/** Initialise the default Firebase app once. Safe to call multiple times. */
export function initFirebase(): void {
  if (getApps().length > 0) return;

  const b64 = process.env["FIREBASE_SERVICE_ACCOUNT_KEY_B64"];
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    initializeApp({ credential: cert(json), projectId: FIREBASE_PROJECT_ID });
    return;
  }
  if (process.env["GOOGLE_APPLICATION_CREDENTIALS"]) {
    initializeApp({ projectId: FIREBASE_PROJECT_ID });
    return;
  }
  throw new Error(
    "No Firebase credentials found.\n" +
      "Set FIREBASE_SERVICE_ACCOUNT_KEY_B64 (base64 service account JSON)\n" +
      "or GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON).",
  );
}

export { getFirestore };
