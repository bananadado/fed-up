import type { CalendarEvent } from "./types";
import type { CalendarProvider } from "../types";

function unfoldLines(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractField(block: string, field: string): string {
  const regex = new RegExp(`^${field}(?:;[^:]*)?:(.+)$`, "m");
  return block.match(regex)?.[1]?.trim() ?? "";
}

function parseICSDateTime(value: string): { iso: string; allDay: boolean } {
  if (/^\d{8}$/.test(value)) {
    return {
      iso: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
      allDay: true,
    };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (match) {
    const [, y, mo, d, h, mi, s, z] = match;
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${z || ""}`, allDay: false };
  }

  return { iso: value, allDay: false };
}

function unescapeICSValue(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export function parseICSText(text: string, source: CalendarProvider = "other"): CalendarEvent[] {
  const unfolded = unfoldLines(text);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const now = new Date().toISOString();

  return blocks.map((raw, index) => {
    const block = raw.split("END:VEVENT")[0] ?? raw;

    const title = unescapeICSValue(extractField(block, "SUMMARY")) || `Event ${index + 1}`;
    const description = unescapeICSValue(extractField(block, "DESCRIPTION"));
    const location = unescapeICSValue(extractField(block, "LOCATION"));
    const uid = extractField(block, "UID") || `ics-${Date.now()}-${index}`;
    const recurrence = extractField(block, "RRULE");

    const startRaw = extractField(block, "DTSTART");
    const endRaw = extractField(block, "DTEND");

    const start = startRaw ? parseICSDateTime(startRaw) : { iso: "", allDay: false };
    const end = endRaw ? parseICSDateTime(endRaw) : { iso: "", allDay: start.allDay };

    return {
      id: uid,
      title,
      description,
      location,
      start: start.iso,
      end: end.iso,
      allDay: start.allDay,
      recurrence,
      source,
      importedAt: now,
    };
  });
}
