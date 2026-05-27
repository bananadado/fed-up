import type { AnalyticsProperties } from "@/lib/posthog";

export type TrackPrototypeEvent = (eventName: string, properties?: AnalyticsProperties) => void;
