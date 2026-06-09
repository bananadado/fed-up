import { initializeApp, getApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  linkWithPopup,
  OAuthProvider,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type AuthError,
  type AuthProvider,
  type User,
} from "firebase/auth";

import { readBrowserPublicEnv } from "@/lib/publicEnv";

declare const __BUN_PUBLIC_FIREBASE_API_KEY__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_AUTH_DOMAIN__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_APP_ID__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_PROJECT_ID__: string | undefined;
declare const __BUN_PUBLIC_FIREBASE_AUTH_EMULATOR_URL__: string | undefined;

const FIREBASE_APP_NAME = "deadline-food-auth";
const DEFAULT_FIREBASE_PROJECT_ID = "drp03-50059";
const EMAIL_LINK_STORAGE_KEY = "deadlineFoodEmailForSignIn";

export type AccountProviderId = "google" | "microsoft";

export type AccountSummary = {
  configured: boolean;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  providerIds: string[];
};

function readRuntimeEnv(key: string): string | undefined {
  const browserValue = readBrowserPublicEnv(key);
  if (browserValue) {
    return browserValue;
  }

  try {
    return typeof process !== "undefined" ? process.env[key] : undefined;
  } catch {
    return undefined;
  }
}

function readPublicEnv(definedValue: string | undefined, key: string): string | undefined {
  return definedValue || readRuntimeEnv(key);
}

function readBrowserOverride(key: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const value = new URLSearchParams(window.location.search).get(key) ?? window.localStorage.getItem(key);

  if (value) {
    window.localStorage.setItem(key, value);
  }

  return value ?? undefined;
}

function firebaseProjectId(): string {
  return readPublicEnv(
    typeof __BUN_PUBLIC_FIREBASE_PROJECT_ID__ === "undefined" ? undefined : __BUN_PUBLIC_FIREBASE_PROJECT_ID__,
    "BUN_PUBLIC_FIREBASE_PROJECT_ID",
  ) ?? DEFAULT_FIREBASE_PROJECT_ID;
}

function firebaseAuthEmulatorUrl(): string | undefined {
  return (
    readBrowserOverride("firebaseAuthEmulatorUrl") ??
    readPublicEnv(
      typeof __BUN_PUBLIC_FIREBASE_AUTH_EMULATOR_URL__ === "undefined"
        ? undefined
        : __BUN_PUBLIC_FIREBASE_AUTH_EMULATOR_URL__,
      "BUN_PUBLIC_FIREBASE_AUTH_EMULATOR_URL",
    )
  );
}

function firebaseConfig(): FirebaseOptions | null {
  const projectId = firebaseProjectId();
  const apiKey = readPublicEnv(
    typeof __BUN_PUBLIC_FIREBASE_API_KEY__ === "undefined" ? undefined : __BUN_PUBLIC_FIREBASE_API_KEY__,
    "BUN_PUBLIC_FIREBASE_API_KEY",
  );

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    projectId,
    authDomain:
      readPublicEnv(
        typeof __BUN_PUBLIC_FIREBASE_AUTH_DOMAIN__ === "undefined" ?
          undefined :
          __BUN_PUBLIC_FIREBASE_AUTH_DOMAIN__,
        "BUN_PUBLIC_FIREBASE_AUTH_DOMAIN",
      ) ?? `${projectId}.firebaseapp.com`,
    appId: readPublicEnv(
      typeof __BUN_PUBLIC_FIREBASE_APP_ID__ === "undefined" ? undefined : __BUN_PUBLIC_FIREBASE_APP_ID__,
      "BUN_PUBLIC_FIREBASE_APP_ID",
    ),
  };
}

let authInstance: Auth | null | undefined;
let anonymousSignInPromise: Promise<User> | null = null;
let emailLinkCompletionPromise: Promise<AccountSummary | null> | null = null;
let emulatorConnected = false;

function userToSummary(user: User | null): AccountSummary {
  return {
    configured: authInstance !== null,
    uid: user?.uid ?? null,
    email: user?.email ?? null,
    displayName: user?.displayName ?? null,
    isAnonymous: user?.isAnonymous ?? true,
    providerIds: user?.providerData.map((provider) => provider.providerId) ?? [],
  };
}

function firebaseApp(): FirebaseApp | null {
  const config = firebaseConfig();

  if (config === null) {
    return null;
  }

  return getApps().some((app) => app.name === FIREBASE_APP_NAME) ?
    getApp(FIREBASE_APP_NAME) :
    initializeApp(config, FIREBASE_APP_NAME);
}

export function getDeadlineFoodAuth(): Auth | null {
  if (authInstance !== undefined) {
    return authInstance;
  }

  const app = firebaseApp();
  if (app === null) {
    authInstance = null;
    return authInstance;
  }

  const auth = getAuth(app);
  const emulatorUrl = firebaseAuthEmulatorUrl();
  if (emulatorUrl && !emulatorConnected) {
    connectAuthEmulator(auth, emulatorUrl, {disableWarnings: true});
    emulatorConnected = true;
  }

  void setPersistence(auth, browserLocalPersistence);
  authInstance = auth;
  return authInstance;
}

export function isAccountAuthConfigured(): boolean {
  return getDeadlineFoodAuth() !== null;
}

export function onDeadlineFoodAccountChanged(callback: (account: AccountSummary) => void): () => void {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    callback(userToSummary(null));
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => callback(userToSummary(user)));
}

export async function ensureDeadlineFoodAuthUser(): Promise<User | null> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    return null;
  }

  if (auth.currentUser !== null) {
    return auth.currentUser;
  }

  if (anonymousSignInPromise === null) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }

  return anonymousSignInPromise;
}

function currentEmailLink(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return isSignInWithEmailLink(getDeadlineFoodAuth()!, window.location.href) ? window.location.href : null;
}

function cleanEmailLinkFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }
  // Strip query params (oobCode etc.) but preserve whatever hash is present.
  const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

export async function completeDeadlineFoodEmailLinkSignIn(): Promise<AccountSummary | null> {
  const auth = getDeadlineFoodAuth();
  if (auth === null || typeof window === "undefined") {
    return null;
  }

  const emailLink = currentEmailLink();
  if (emailLink === null) {
    return null;
  }

  if (emailLinkCompletionPromise !== null) {
    return emailLinkCompletionPromise;
  }

  emailLinkCompletionPromise = (async () => {
    const email = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
    if (!email) {
      throw new Error("Open the sign-in link in the same browser where you requested it, or request a new link.");
    }

    const result = await signInWithEmailLink(auth, email, emailLink);
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    cleanEmailLinkFromUrl();
    return userToSummary(result.user);
  })().finally(() => {
    emailLinkCompletionPromise = null;
  });

  return emailLinkCompletionPromise;
}

export async function getDeadlineFoodAuthToken(): Promise<string | null> {
  await completeDeadlineFoodEmailLinkSignIn().catch(() => null);
  const user = await ensureDeadlineFoodAuthUser();
  return user ? user.getIdToken() : null;
}

function providerFor(providerId: AccountProviderId): AuthProvider {
  if (providerId === "google") {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({prompt: "select_account"});
    return provider;
  }

  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({prompt: "select_account"});
  provider.addScope("email");
  provider.addScope("profile");
  return provider;
}

function firebaseErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ?
    String((error as {code?: unknown}).code) :
    "";
}

export async function linkDeadlineFoodAccount(providerId: AccountProviderId): Promise<AccountSummary> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    throw new Error("Firebase Auth is not configured for this app.");
  }

  const user = await ensureDeadlineFoodAuthUser();
  const provider = providerFor(providerId);

  try {
    if (user?.isAnonymous) {
      const result = await linkWithPopup(user, provider);
      return userToSummary(result.user);
    }

    const result = await signInWithPopup(auth, provider);
    return userToSummary(result.user);
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (
      code === "auth/credential-already-in-use" ||
      code === "auth/email-already-in-use" ||
      code === "auth/account-exists-with-different-credential" ||
      code === "auth/provider-already-linked"
    ) {
      const result = await signInWithPopup(auth, provider);
      return userToSummary(result.user);
    }

    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw new Error("Sign-in was cancelled.", {cause: error});
    }

    throw error;
  }
}

export async function sendDeadlineFoodEmailMagicLink(email: string): Promise<void> {
  const auth = getDeadlineFoodAuth();
  if (auth === null || typeof window === "undefined") {
    throw new Error("Firebase Auth is not configured for this app.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  // Use origin-only URL so Firebase can append oobCode as query params.
  // A hash fragment in the continueUrl causes Firebase to append params after
  // the hash where isSignInWithEmailLink() cannot find them.
  const url = `${window.location.origin}/`;

  await sendSignInLinkToEmail(auth, normalizedEmail, {
    url,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, normalizedEmail);
}

const MICROSOFT_REDIRECT_PENDING_KEY = "deadlineFoodMicrosoftAuthPending";

export async function linkDeadlineFoodMicrosoftRedirect(): Promise<void> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    throw new Error("Firebase Auth is not configured for this app.");
  }

  const provider = providerFor("microsoft");

  // Use localStorage, not sessionStorage: sessionStorage is not guaranteed to
  // survive the cross-origin hop chain (localhost → microsoftonline.com →
  // firebaseapp.com/__/auth/handler → localhost).
  try {
    window.localStorage.setItem(MICROSOFT_REDIRECT_PENDING_KEY, String(Date.now()));
  } catch { /* ignore */ }

  // Always signInWithRedirect rather than linkWithRedirect: linkWithRedirect
  // stores extra anonymous-user-linking state that can also be lost across
  // the same multi-origin redirect chain.
  await signInWithRedirect(auth, provider);
}

export async function checkDeadlineFoodMicrosoftRedirectResult(): Promise<AccountSummary | null> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) return null;

  let pending = false;
  try {
    const stored = window.localStorage.getItem(MICROSOFT_REDIRECT_PENDING_KEY);
    if (stored !== null) {
      const ageMs = Date.now() - Number(stored);
      // Valid if initiated within the last 10 minutes.
      pending = ageMs < 10 * 60 * 1000;
      // Clear if pending or older than 30 min (stale).
      if (pending || ageMs > 30 * 60 * 1000) {
        window.localStorage.removeItem(MICROSOFT_REDIRECT_PENDING_KEY);
      }
    }
  } catch { /* ignore */ }

  if (!pending) return null;

  try {
    const result = await getRedirectResult(auth);
    if (result) return userToSummary(result.user);
    // Firebase may have already consumed the redirect result via onAuthStateChanged.
    // Fall back to the current user if they are non-anonymous.
    const current = auth.currentUser;
    return current && !current.isAnonymous ? userToSummary(current) : null;
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (
      code === "auth/credential-already-in-use" ||
      code === "auth/email-already-in-use" ||
      code === "auth/account-exists-with-different-credential"
    ) {
      const credential = OAuthProvider.credentialFromError(error as AuthError);
      if (credential) {
        const result = await signInWithCredential(auth, credential);
        return userToSummary(result.user);
      }
    }
    throw error;
  }
}

export async function switchToAnonymousAccountOnThisDevice(): Promise<AccountSummary> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    return userToSummary(null);
  }

  await signOut(auth);
  const user = await ensureDeadlineFoodAuthUser();
  return userToSummary(user);
}
