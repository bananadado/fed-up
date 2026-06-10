import { afterEach, describe, expect, test } from "bun:test";

import {
  deadlinesFromContext,
  fetchDeadlineContext,
  resolveDeadlinesFromEvents,
  type DeadlineContextResponse,
} from "./deadlineContext";
import type { CalendarEvent } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e",
    title: "Event",
    description: "",
    location: "",
    start: "2099-01-02T10:00:00",
    end: "",
    allDay: false,
    recurrence: "",
    source: "other",
    importedAt: "",
    ...overrides,
  };
}

function classified(index: number, overrides: Partial<DeadlineContextResponse["events"][number]> = {}) {
  return {
    index,
    date: "2099-01-02",
    category: "deadline",
    event_type: "academic" as const,
    is_deadline: true,
    days_until: 1,
    urgency: "high" as const,
    effort_hours: 3,
    ...overrides,
  };
}

function contextResponse(overrides: Partial<DeadlineContextResponse> = {}): DeadlineContextResponse {
  return { today: "2099-01-01", horizon_days: 14, deadlines: [], events: [], days: [], ...overrides };
}

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = ((url: string, init?: RequestInit) => Promise.resolve(impl(url, init))) as typeof fetch;
}

describe("deadlinesFromContext", () => {
  test("maps backend classification onto deadlines", () => {
    const events = [event({ title: "Coursework deadline" })];
    const context = contextResponse({ events: [classified(0)] });

    const deadline = deadlinesFromContext(events, context)[0]!;
    expect(deadline.eventType).toBe("academic");
    expect(deadline.urgency).toBe("high");
    expect(deadline.effortHours).toBe(3);
    expect(deadline.intensity).toBe("High");
    expect(deadline.title).toBe("Coursework deadline");
  });

  test("general events get Low intensity and zero effort", () => {
    const events = [event({ title: "Gym" })];
    const context = contextResponse({
      events: [classified(0, { category: "exercise", event_type: "general", is_deadline: false, urgency: "low", effort_hours: 0 })],
    });

    const deadline = deadlinesFromContext(events, context)[0]!;
    expect(deadline.eventType).toBe("general");
    expect(deadline.intensity).toBe("Low");
    expect(deadline.effortHours).toBe(0);
  });

  test("filters past events but keeps original index alignment", () => {
    const events = [
      event({ title: "Old", start: "2000-01-01T10:00:00" }),
      event({ title: "Future deadline", start: "2099-01-02T10:00:00" }),
    ];
    const context = contextResponse({
      events: [
        classified(0, { date: "2000-01-01", urgency: "low" }),
        classified(1, { urgency: "high" }),
      ],
    });

    const deadlines = deadlinesFromContext(events, context);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]!.title).toBe("Future deadline");
    expect(deadlines[0]!.urgency).toBe("high");
  });

  test("falls back to a general default when no classification exists for an index", () => {
    const events = [event({ title: "Mystery" })];
    const deadline = deadlinesFromContext(events, contextResponse({ events: [] }))[0]!;
    expect(deadline.eventType).toBe("general");
    expect(deadline.effortHours).toBe(0);
  });
});

describe("fetchDeadlineContext", () => {
  test("posts events mapped to the backend shape", async () => {
    let captured: { events: { title: string; all_day: boolean }[] } | null = null;
    mockFetch((_url, init) => {
      captured = JSON.parse(String(init?.body));
      return { ok: true, status: 200, json: async () => contextResponse() };
    });

    await fetchDeadlineContext([event({ title: "Exam", allDay: true })]);
    expect(captured!.events[0]!.title).toBe("Exam");
    expect(captured!.events[0]!.all_day).toBe(true);
  });
});

describe("resolveDeadlinesFromEvents", () => {
  test("uses the backend classification when reachable", async () => {
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => contextResponse({ events: [classified(0)] }),
    }));

    const deadlines = await resolveDeadlinesFromEvents([event({ title: "Random title" })]);
    expect(deadlines[0]!.eventType).toBe("academic");
    expect(deadlines[0]!.urgency).toBe("high");
  });

  test("falls back to local classification when the backend fails", async () => {
    mockFetch(() => ({ ok: false, status: 502, json: async () => ({}) }));

    // "Coursework" matches the local academic regex, proving the local path ran.
    const deadlines = await resolveDeadlinesFromEvents([event({ title: "Coursework brief" })]);
    expect(deadlines[0]!.eventType).toBe("academic");
  });
});
