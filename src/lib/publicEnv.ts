type PublicEnvWindow = typeof window & {
  __DEADLINE_FOOD_PUBLIC_ENV__?: Record<string, string>;
};

export function readBrowserPublicEnv(key: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as PublicEnvWindow).__DEADLINE_FOOD_PUBLIC_ENV__?.[key];
}

export async function loadBrowserPublicEnv(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const response = await fetch("/api/public-env", {cache: "no-store"});
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !contentType.includes("application/json")) {
      return;
    }

    const env = await response.json() as Record<string, unknown>;
    const publicEnv = Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );

    (window as PublicEnvWindow).__DEADLINE_FOOD_PUBLIC_ENV__ = {
      ...(window as PublicEnvWindow).__DEADLINE_FOOD_PUBLIC_ENV__,
      ...publicEnv,
    };
  } catch {
    // Static deployments rely on build-time defines instead of this dev endpoint.
  }
}
