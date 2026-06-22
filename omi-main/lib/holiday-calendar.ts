// lib/holiday-calendar.ts
// Nigerian public holidays (WAT UTC+1) + optional Google Calendar enrichment.
// Primary source: static list (zero network dependency, always works).
// Secondary source: Google Calendar public API (enriches if available).
// Used exclusively by withdrawal-policy.ts to determine Monday window shifts.

export type Holiday = {
  date: string; // "YYYY-MM-DD"
  name: string;
  observed?: boolean; // true when a Sunday holiday is observed on Monday
};

// ─── STATIC NIGERIAN PUBLIC HOLIDAYS 2025–2027 ──────────────────────────────
// Sources: Official Nigerian Federal Government gazette + CBN calendar.
// When a holiday falls on Sunday, Nigeria observes it on Monday.
const STATIC_HOLIDAYS: Holiday[] = [
  // 2025
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-03-31", name: "Eid al-Fitr (tentative)", observed: true },
  { date: "2025-04-01", name: "Eid al-Fitr Holiday (tentative)" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-04-21", name: "Easter Monday" },
  { date: "2025-05-01", name: "Workers' Day" },
  { date: "2025-06-06", name: "Eid al-Adha (tentative)" },
  { date: "2025-06-07", name: "Eid al-Adha Holiday (tentative)" },
  { date: "2025-06-12", name: "Democracy Day" },
  { date: "2025-09-04", name: "Mawlid al-Nabi (tentative)" },
  { date: "2025-10-01", name: "Independence Day" },
  { date: "2025-12-25", name: "Christmas Day" },
  { date: "2025-12-26", name: "Boxing Day" },

  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-03-20", name: "Eid al-Fitr (tentative)", observed: true },
  { date: "2026-03-21", name: "Eid al-Fitr Holiday (tentative)" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-05-01", name: "Workers' Day" },
  { date: "2026-05-27", name: "Eid al-Adha (tentative)" },
  { date: "2026-05-28", name: "Eid al-Adha Holiday (tentative)" },
  { date: "2026-06-12", name: "Democracy Day" },
  { date: "2026-08-24", name: "Mawlid al-Nabi (tentative)" },
  { date: "2026-10-01", name: "Independence Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
  { date: "2026-12-28", name: "Boxing Day (observed)", observed: true },

  // 2027
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-03-09", name: "Eid al-Fitr (tentative)" },
  { date: "2027-03-10", name: "Eid al-Fitr Holiday (tentative)" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-05-01", name: "Workers' Day" },
  { date: "2027-05-15", name: "Eid al-Adha (tentative)" },
  { date: "2027-05-16", name: "Eid al-Adha Holiday (tentative)" },
  { date: "2027-06-12", name: "Democracy Day" },
  { date: "2027-08-13", name: "Mawlid al-Nabi (tentative)" },
  { date: "2027-10-01", name: "Independence Day" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-26", name: "Boxing Day" },
  { date: "2027-12-27", name: "Christmas Day (observed)", observed: true },
];

// ─── IN-MEMORY CACHE ─────────────────────────────────────────────────────────
let _enrichedCache: Holiday[] | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── DATE HELPERS (WAT = UTC+1) ───────────────────────────────────────────────
export function toWATDateString(d: Date): string {
  // Returns "YYYY-MM-DD" in WAT (UTC+1)
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  return wat.toISOString().slice(0, 10);
}

export function nowInWAT(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

// ─── GOOGLE CALENDAR ENRICHMENT (optional, server-side only) ─────────────────
// Uses the Google Calendar public API with the Nigeria holiday calendar ID.
// Requires no API key — the Nigerian holidays calendar is publicly accessible.
const GOOGLE_CAL_ID =
  "en.nigerian%23holiday%40group.v.calendar.google.com";

async function fetchGoogleHolidays(year: number): Promise<Holiday[]> {
  try {
    const timeMin = `${year}-01-01T00:00:00Z`;
    const timeMax = `${year}-12-31T23:59:59Z`;
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${GOOGLE_CAL_ID}/events` +
      `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json() as {
      items?: Array<{ start: { date?: string }; summary?: string }>;
    };
    return (data.items ?? [])
      .filter((e) => e.start?.date)
      .map((e) => ({ date: e.start.date!, name: e.summary ?? "Holiday" }));
  } catch {
    return []; // graceful fallback to static list
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Returns merged holiday list (static + Google enrichment if available). */
export async function getHolidays(): Promise<Holiday[]> {
  if (_enrichedCache && Date.now() < _cacheExpiry) return _enrichedCache;

  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const googleHolidays: Holiday[] = [];

  // Only attempt Google fetch on server (no window object)
  if (typeof window === "undefined") {
    for (const y of years) {
      const fetched = await fetchGoogleHolidays(y);
      googleHolidays.push(...fetched);
    }
  }

  // Merge: Google overrides static for same date (more accurate for lunar holidays)
  const merged = new Map<string, Holiday>();
  for (const h of STATIC_HOLIDAYS) merged.set(h.date, h);
  for (const h of googleHolidays) merged.set(h.date, h); // Google wins on conflict

  _enrichedCache = Array.from(merged.values());
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return _enrichedCache;
}

/** Synchronous version — uses static list only. Safe to call client-side. */
export function getHolidaysSync(): Holiday[] {
  return STATIC_HOLIDAYS;
}

/** Check if a given WAT date string ("YYYY-MM-DD") is a public holiday. */
export function isHolidayDate(
  watDateStr: string,
  holidays: Holiday[] = STATIC_HOLIDAYS,
): Holiday | null {
  return holidays.find((h) => h.date === watDateStr) ?? null;
}

/** Check if today (WAT) is a public holiday. */
export function getTodayHolidayWAT(
  holidays: Holiday[] = STATIC_HOLIDAYS,
): Holiday | null {
  return isHolidayDate(toWATDateString(new Date()), holidays);
}

/** Returns the next Monday that is NOT a public holiday (WAT). */
export function nextValidWithdrawalMonday(
  holidays: Holiday[] = STATIC_HOLIDAYS,
): Date {
  const now = nowInWAT();
  const today = now.getDay(); // 0=Sun … 6=Sat

  // Days until next Monday (or this Monday if today is Monday — handled in policy)
  let daysAhead = today === 1 ? 7 : (8 - today) % 7 || 7;
  let candidate = new Date(now);
  candidate.setDate(candidate.getDate() + daysAhead);
  candidate.setHours(8, 0, 0, 0); // 08:00 WAT

  // Shift forward if that Monday is a holiday (try up to 4 extra weeks)
  for (let i = 0; i < 4; i++) {
    const ds = candidate.toISOString().slice(0, 10); // already WAT-adjusted
    if (!isHolidayDate(ds, holidays)) break;
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

/** Formats a withdrawal window date for display. */
export function formatWithdrawalWindow(d: Date): string {
  return d.toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }) + ", 08:00 – 16:00 WAT";
}