import type {CalendarEvent} from "./icsParser";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_URL = "https://graph.microsoft.com/v1.0/me/calendarView";

const academicPattern = /coursework|exam|quiz|deadline|submission|review|presentation|project/i;

export function filterFutureEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return events.filter((event) => {
    if (!event.start) return true;
    const startDate = new Date(event.start);
    if (Number.isNaN(startDate.getTime())) return true;
    return startDate >= todayStart;
  });
}

export type Deadline = {
  id: string;
  title: string;
  date: string;
  time: string;
  intensity: string;
  eventType: "academic" | "general";
  effortHours: number;
  urgency: string;
  rawDate?: string;
  confirmed?: boolean;
};

export function calendarEventsToDeadlines(events: CalendarEvent[]): Deadline[] {
  return filterFutureEvents(events).map((event, index) => {
    const eventType = academicPattern.test(event.title) ? "academic" : "general";
    const startDate = event.start ? new Date(event.start) : null;

    const dateLabel =
      startDate && !Number.isNaN(startDate.getTime()) ?
        startDate.toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short"}) :
        "Upcoming";

    let timeLabel = "All day";
    if (!event.allDay && startDate && !Number.isNaN(startDate.getTime())) {
      timeLabel = startDate.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"});
    }

    const rawDate =
      startDate && !Number.isNaN(startDate.getTime()) ?
        startDate.toISOString().slice(0, 10) :
        undefined;

    return {
      id: `cal-${event.source}-${index}`,
      title: event.title,
      date: dateLabel,
      time: timeLabel,
      intensity: eventType === "academic" ? "Medium" : "Low",
      eventType,
      effortHours: eventType === "academic" ? 3 : 0,
      urgency: eventType === "academic" ? "medium" : "low",
      confirmed: false,
      rawDate,
    };
  });
}

export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{accessToken: string; expiresAt: string}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = (await response.json()) as {error_description?: string};
    throw new Error(body.error_description ?? `Google token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {access_token?: string; expires_in?: number};
  if (!data.access_token) throw new Error("No access token in Google refresh response");

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export async function refreshOutlookToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{accessToken: string; newRefreshToken: string; expiresAt: string}> {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid Calendars.Read offline_access",
    }),
  });

  if (!response.ok) {
    const body = (await response.json()) as {error_description?: string};
    throw new Error(body.error_description ?? `Outlook token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("No access token in Outlook refresh response");

  return {
    accessToken: data.access_token,
    newRefreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {dateTime?: string; date?: string};
  end?: {dateTime?: string; date?: string};
  recurrence?: string[];
  status?: string;
};

export async function fetchGoogleEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now);
  until.setMonth(until.getMonth() + 3);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    maxResults: "250",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(`${GOOGLE_CALENDAR_API}?${params}`, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });

  if (!response.ok) {
    throw new Error(`Google Calendar API returned ${response.status}`);
  }

  const data = (await response.json()) as {items?: GoogleEvent[]};
  const importedAt = new Date().toISOString();

  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id ?? `google-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: e.summary ?? "Untitled event",
      description: e.description ?? "",
      location: e.location ?? "",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      allDay: !e.start?.dateTime,
      recurrence: e.recurrence?.join(";") ?? "",
      source: "google",
      importedAt,
    }));
}

type OutlookEvent = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  location?: {displayName?: string};
  start?: {dateTime?: string; timeZone?: string};
  end?: {dateTime?: string; timeZone?: string};
  isAllDay?: boolean;
  recurrence?: unknown;
};

export async function fetchOutlookEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const until = new Date(now);
  until.setMonth(until.getMonth() + 3);

  const params = new URLSearchParams({
    startDateTime: now.toISOString(),
    endDateTime: until.toISOString(),
    $top: "250",
    $orderby: "start/dateTime",
    $select: "id,subject,bodyPreview,location,start,end,isAllDay,recurrence",
  });

  const response = await fetch(`${MICROSOFT_GRAPH_URL}?${params}`, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph API returned ${response.status}`);
  }

  const data = (await response.json()) as {value?: OutlookEvent[]};
  const importedAt = new Date().toISOString();

  return (data.value ?? []).map((e) => ({
    id: e.id ?? `outlook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: e.subject ?? "Untitled event",
    description: e.bodyPreview ?? "",
    location: e.location?.displayName ?? "",
    start: e.start?.dateTime ? new Date(e.start.dateTime + "Z").toISOString() : "",
    end: e.end?.dateTime ? new Date(e.end.dateTime + "Z").toISOString() : "",
    allDay: e.isAllDay ?? false,
    recurrence: e.recurrence ? JSON.stringify(e.recurrence) : "",
    source: "outlook",
    importedAt,
  }));
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<{accessToken: string; refreshToken?: string; expiresAt: string}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = (await response.json()) as {error_description?: string};
    throw new Error(body.error_description ?? `Google code exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("No access token in Google response");

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}

export async function exchangeOutlookCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string,
): Promise<{accessToken: string; refreshToken?: string; expiresAt: string}> {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      scope: "openid Calendars.Read offline_access",
    }),
  });

  if (!response.ok) {
    const body = (await response.json()) as {error_description?: string};
    throw new Error(body.error_description ?? `Outlook code exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("No access token in Outlook response");

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
}
