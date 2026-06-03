// Cooking-time calendar export (issue #120 / F23).
//
// Prototype-appropriate, OAuth-free calendar export. We generate a universal
// iCalendar (.ics) file and a Google Calendar template URL so a user can drop a
// cooking block (meal name + estimated cook time, with an optional shopping
// reminder) into Google, Apple or Outlook calendars without any backend or
// account linking. Real two-way calendar sync is tracked separately (#101) and
// is intentionally out of scope here.
//
// All helpers are pure and deterministic so they can be unit-tested.

export type CookingCalendarBlock = {
  /** Name of the meal being cooked. */
  mealName: string;
  /** Estimated cook time in minutes (used to size the calendar block). */
  cookMinutes: number;
  /** Local calendar date for the cooking block, ISO `YYYY-MM-DD`. */
  dateIso: string;
  /** Local start time, 24h `HH:MM`. */
  time: string;
  /** When true, attach a shopping reminder alarm ahead of the block. */
  shoppingReminder?: boolean;
  /** Minutes before the cooking block the shopping reminder fires. Default 120. */
  shoppingReminderLeadMinutes?: number;
};

const DEFAULT_SHOPPING_LEAD_MINUTES = 120;
// Minimum visible block length so a quick meal still shows up as a real event.
const MIN_BLOCK_MINUTES = 15;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Combine a local ISO date (`YYYY-MM-DD`) and 24h `HH:MM` into a Date in the
 * user's local timezone. Returns null if either part is malformed.
 */
export function parseLocalDateTime(dateIso: string, time: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/** Format a Date as a floating (local, no timezone) iCalendar timestamp. */
export function toIcsLocalStamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

/** Format a Date as a UTC iCalendar timestamp (used for DTSTAMP). */
export function toIcsUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Escape a value for inclusion in an iCalendar text property (RFC 5545). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function blockMinutes(cookMinutes: number): number {
  const rounded = Math.round(cookMinutes);
  return Number.isFinite(rounded) && rounded > 0 ? Math.max(rounded, MIN_BLOCK_MINUTES) : MIN_BLOCK_MINUTES;
}

function eventSummary(block: CookingCalendarBlock): string {
  return `Cook: ${block.mealName}`;
}

function eventDescription(block: CookingCalendarBlock): string {
  const minutes = blockMinutes(block.cookMinutes);
  const lines = [
    `Estimated cook time: ${minutes} min.`,
    "Scheduled from Deadline Food Autopilot (illustrative prototype).",
  ];
  if (block.shoppingReminder) {
    lines.push("Reminder: pick up ingredients before you start.");
  }
  return lines.join("\n");
}

/**
 * Build an RFC 5545 iCalendar document for a single cooking block. The event
 * uses floating local time so it lands at the chosen wall-clock time in any
 * calendar app. A VALARM is added when a shopping reminder is requested.
 *
 * `now` is injectable for deterministic tests (DTSTAMP / UID).
 */
export function buildCookingIcs(block: CookingCalendarBlock, now: Date = new Date()): string {
  const start = parseLocalDateTime(block.dateIso, block.time);
  if (!start) {
    throw new Error(`Invalid cooking block date/time: ${block.dateIso} ${block.time}`);
  }
  const minutes = blockMinutes(block.cookMinutes);
  const end = new Date(start.getTime() + minutes * 60_000);
  const lead = block.shoppingReminderLeadMinutes ?? DEFAULT_SHOPPING_LEAD_MINUTES;
  const uid = `cook-${toIcsLocalStamp(start)}-${Math.abs(hashString(block.mealName))}@deadline-food-autopilot`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Deadline Food Autopilot//Cooking Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtcStamp(now)}`,
    `DTSTART:${toIcsLocalStamp(start)}`,
    `DTEND:${toIcsLocalStamp(end)}`,
    `SUMMARY:${escapeIcsText(eventSummary(block))}`,
    `DESCRIPTION:${escapeIcsText(eventDescription(block))}`,
  ];

  if (block.shoppingReminder) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`Shopping reminder: ingredients for ${block.mealName}`)}`,
      `TRIGGER:-PT${lead}M`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  // iCalendar lines are CRLF-terminated.
  return lines.join("\r\n") + "\r\n";
}

/**
 * Build a Google Calendar "template" URL that pre-fills a cooking block. This is
 * an alternative to the .ics download for users who live in Google Calendar; it
 * needs no OAuth.
 */
export function buildGoogleCalendarUrl(block: CookingCalendarBlock): string {
  const start = parseLocalDateTime(block.dateIso, block.time);
  if (!start) {
    throw new Error(`Invalid cooking block date/time: ${block.dateIso} ${block.time}`);
  }
  const minutes = blockMinutes(block.cookMinutes);
  const end = new Date(start.getTime() + minutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventSummary(block),
    dates: `${toIcsLocalStamp(start)}/${toIcsLocalStamp(end)}`,
    details: eventDescription(block),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A filesystem-safe filename for the downloaded cooking block. */
export function cookingIcsFilename(block: CookingCalendarBlock): string {
  const slug =
    block.mealName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "meal";
  return `cook-${slug}-${block.dateIso}.ics`;
}

// Small deterministic string hash (FNV-1a) for stable UIDs without crypto.
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
