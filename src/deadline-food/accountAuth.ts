import { initializeApp, getApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  fetchSignInMethodsForEmail,
  getAuth,
  getAdditionalUserInfo,
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
const EMAIL_LINK_INTENT_STORAGE_KEY = "deadlineFoodEmailLinkIntent";

export type AccountProviderId = "google" | "microsoft";

// Tone for account-area notices so the UI can style errors apart from success.
export type AccountMessageTone = "info" | "error";

export type AccountSummary = {
  configured: boolean;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  providerIds: string[];
};

export type EmailMagicLinkOptions = {
  requireExistingAccount?: boolean;
  intent?: EmailMagicLinkIntent;
};

export type EmailMagicLinkIntent = "existing" | "create";

export type EmailLinkCompletion = {
  account: AccountSummary;
  intent: EmailMagicLinkIntent;
  isNewUser: boolean;
};

export const NO_ACCOUNT_YET_MESSAGE = "No, there isn't an account yet. Please continue to create one.";

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
let emailLinkCompletionPromise: Promise<EmailLinkCompletion | null> | null = null;
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

export async function completeDeadlineFoodEmailLinkSignIn(): Promise<EmailLinkCompletion | null> {
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
    const storedIntent = window.localStorage.getItem(EMAIL_LINK_INTENT_STORAGE_KEY);
    const intent: EmailMagicLinkIntent = storedIntent === "create" ? "create" : "existing";
    if (!email) {
      throw new Error("Open the sign-in link in the same browser where you requested it, or request a new link.");
    }

    let result;
    try {
      result = await signInWithEmailLink(auth, email, emailLink);
    } catch (error) {
      window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
      window.localStorage.removeItem(EMAIL_LINK_INTENT_STORAGE_KEY);
      cleanEmailLinkFromUrl();
      throw new Error(friendlyAuthErrorMessage(error, "email"), {cause: error});
    }
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    window.localStorage.removeItem(EMAIL_LINK_INTENT_STORAGE_KEY);
    cleanEmailLinkFromUrl();
    const additionalInfo = getAdditionalUserInfo(result);
    return {account: userToSummary(result.user), intent, isNewUser: additionalInfo?.isNewUser === true};
  })().finally(() => {
    emailLinkCompletionPromise = null;
  });

  return emailLinkCompletionPromise;
}

export async function getDeadlineFoodAuthToken(): Promise<string | null> {
  await completeDeadlineFoodEmailLinkSignIn().catch(() => null);
  // Only attach a token for a user who is already signed in. Do NOT call
  // ensureDeadlineFoodAuthUser here: that would silently create an anonymous
  // Firebase user on every session load. Anonymous use is keyed purely by the
  // localStorage session id until the user explicitly chooses to sign in or to
  // "continue without signing in" (which signs in anonymously on purpose).
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    return null;
  }
  // Firebase restores a persisted (signed-in) user from IndexedDB
  // asynchronously after page load. authStateReady() resolves once that initial
  // restore has settled, so on a reload we attach the real account's token
  // instead of racing it and falling back to an anonymous session — which is
  // what previously bounced returning users back through onboarding.
  await auth.authStateReady();
  const user = auth.currentUser;
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

function firebaseErrorEmail(error: unknown): string | null {
  const customData = (error as {customData?: {email?: unknown}} | null)?.customData;
  return typeof customData?.email === "string" && customData.email.length > 0 ? customData.email : null;
}

// Maps Firebase sign-in-method identifiers to human labels for conflict messages.
const SIGN_IN_METHOD_LABELS: Record<string, string> = {
  "google.com": "Google",
  "microsoft.com": "Microsoft",
  "password": "an email and password",
  "emailLink": "an email sign-in link",
};

function providerLabel(providerId: AccountProviderId): string {
  return providerId === "google" ? "Google" : "Microsoft";
}

function joinWithOr(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

// Turns the known Firebase Auth error codes into copy a user can act on. Unknown
// codes fall back to a neutral retry message so a raw "auth/…" string never
// reaches the UI. The original error is preserved as `cause` for debugging.
function friendlyAuthErrorMessage(error: unknown, label = "this sign-in method"): string {
  switch (firebaseErrorCode(error)) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return "Sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site, then try again.";
    case "auth/network-request-failed":
      return "We couldn't reach the sign-in service. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a minute and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/operation-not-allowed":
      return `${label} sign-in isn't enabled for this app yet.`;
    case "auth/unauthorized-domain":
      return "This site isn't authorised for sign-in yet. Please try again later.";
    case "auth/web-storage-unsupported":
    case "auth/operation-not-supported-in-this-environment":
      return "Your browser is blocking the storage sign-in needs. Turn off strict privacy / third-party-cookie blocking, or try another browser.";
    case "auth/timeout":
      return "Sign-in timed out. Please try again.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/missing-email":
      return "Please enter your email address.";
    case "auth/quota-exceeded":
      return "We've sent too many emails for now. Please try again later.";
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This sign-in link has expired or has already been used. Please request a new one.";
    case "auth/invalid-credential":
    case "auth/invalid-verification-code":
      return "That sign-in didn't work. Please try again.";
    default:
      return "Sign-in couldn't be completed. Please try again.";
  }
}

// `account-exists-with-different-credential` / `email-already-in-use`: the email
// belongs to an account created with another provider. Name the original
// method(s) when the project allows it; otherwise give an actionable hint.
async function describeExistingAccountConflict(auth: Auth, error: unknown): Promise<string> {
  const email = firebaseErrorEmail(error);
  if (email === null) {
    return "An account already exists with this email using a different sign-in method. Please sign in with the method you used originally.";
  }

  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    const labels = [...new Set(
      methods.map((method) => SIGN_IN_METHOD_LABELS[method]).filter((value): value is string => Boolean(value)),
    )];
    if (labels.length > 0) {
      return `${email} is already registered with ${joinWithOr(labels)}. Please sign in with ${labels[0]} instead.`;
    }
  } catch {
    // Email-enumeration protection (or a network error) hid the method list.
  }

  return `${email} is already registered with a different sign-in method. Please use the one you signed up with (for example Google, Microsoft, or an email link).`;
}

async function assertEmailBelongsToExistingAccount(auth: Auth, email: string): Promise<void> {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length === 0) {
      throw new Error(NO_ACCOUNT_YET_MESSAGE);
    }
  } catch (error) {
    if (error instanceof Error && error.message === NO_ACCOUNT_YET_MESSAGE) {
      throw error;
    }
    throw new Error(friendlyAuthErrorMessage(error, "email"), {cause: error});
  }
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

    // The credential is this same provider, just already attached to a real
    // account (e.g. linking an anonymous user whose email is taken). Signing in
    // with the same provider resolves it.
    if (code === "auth/credential-already-in-use" || code === "auth/provider-already-linked") {
      const result = await signInWithPopup(auth, provider);
      return userToSummary(result.user);
    }

    // The email belongs to an account created with a DIFFERENT provider. Retrying
    // the same provider can never succeed — tell the user which method to use.
    if (code === "auth/account-exists-with-different-credential" || code === "auth/email-already-in-use") {
      throw new Error(await describeExistingAccountConflict(auth, error), {cause: error});
    }

    throw new Error(friendlyAuthErrorMessage(error, providerLabel(providerId)), {cause: error});
  }
}

export type ProviderSignInResult = {
  account: AccountSummary;
  isNewUser: boolean;
};

export async function signInExistingDeadlineFoodAccount(providerId: AccountProviderId): Promise<ProviderSignInResult> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    throw new Error("Firebase Auth is not configured for this app.");
  }

  const provider = providerFor(providerId);

  try {
    const result = await signInWithPopup(auth, provider);
    const additionalInfo = getAdditionalUserInfo(result);
    return {account: userToSummary(result.user), isNewUser: additionalInfo?.isNewUser === true};
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (code === "auth/account-exists-with-different-credential" || code === "auth/email-already-in-use") {
      throw new Error(await describeExistingAccountConflict(auth, error), {cause: error});
    }

    throw new Error(friendlyAuthErrorMessage(error, providerLabel(providerId)), {cause: error});
  }
}

export async function sendDeadlineFoodEmailMagicLink(email: string, options: EmailMagicLinkOptions = {}): Promise<void> {
  const auth = getDeadlineFoodAuth();
  if (auth === null || typeof window === "undefined") {
    throw new Error("Firebase Auth is not configured for this app.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Please enter a valid email address.");
  }

  if (options.requireExistingAccount) {
    await assertEmailBelongsToExistingAccount(auth, normalizedEmail);
  }

  // Use origin-only URL so Firebase can append oobCode as query params.
  // A hash fragment in the continueUrl causes Firebase to append params after
  // the hash where isSignInWithEmailLink() cannot find them.
  const url = `${window.location.origin}/`;

  try {
    await sendSignInLinkToEmail(auth, normalizedEmail, {
      url,
      handleCodeInApp: true,
    });
  } catch (error) {
    throw new Error(friendlyAuthErrorMessage(error, "email"), {cause: error});
  }
  window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, normalizedEmail);
  const intent = options.intent ?? (options.requireExistingAccount ? "existing" : "create");
  window.localStorage.setItem(EMAIL_LINK_INTENT_STORAGE_KEY, intent);
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

// Clears the local Firebase session after the backend has deleted the account
// (Firestore profile + Auth user) via DELETE /session. The cached credential is
// now invalid, so we sign out locally to drop it before the app reloads. Using
// server-side admin deletion avoids the client-side auth/requires-recent-login
// reauth dance entirely.
export async function signOutDeadlineFoodAccount(): Promise<void> {
  const auth = getDeadlineFoodAuth();
  if (auth === null) {
    return;
  }
  await signOut(auth).catch(() => {
    // The user record is already gone server-side; a failed client sign-out is
    // harmless because the page reloads into a fresh anonymous session next.
  });
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
