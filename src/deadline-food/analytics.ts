import type { AnalyticsProperties } from "@/lib/posthog";

export type TrackEvent = (eventName: string, properties?: AnalyticsProperties) => void;
