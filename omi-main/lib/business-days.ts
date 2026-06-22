// lib/business-days.ts
// Nigerian public holidays + international bank holidays
// Used to block withdrawals on non-business days

export type HolidayInfo = {
  date: string; // YYYY-MM-DD
  name: string;
  country?: string; // undefined = global
};

// Nigerian public holidays (recurring annually — month-day format MM-DD)
const NIGERIAN_HOLIDAYS_RECURRING: Array<{ monthDay: string; name: string }> = [
  { monthDay: "01-01", name: "New Year's Day" },
  { monthDay: "05-01", name: "Workers' Day" },
  { monthDay: "06-12", name: "Democracy Day" },
  { monthDay: "10-01", name: "Independence Day" },
  { monthDay: "12-25", name: "Christmas Day" },
  { monthDay: "12-26", name: "Boxing Day" },
];

// Fixed-date global/international bank holidays (MM-DD)
const GLOBAL_BANK_HOLIDAYS_RECURRING: Array<{
  monthDay: string;
  name: string;
}> = [
  { monthDay: "01-01", name: "New Year's Day (Global)" },
  { monthDay: "12-25", name: "Christmas Day (Global)" },
];

// One-off holidays (YYYY-MM-DD) — add future ones as needed
const ONE_OFF_HOLIDAYS: HolidayInfo[] = [
  // Nigerian floating holidays — approximate fixed for 2025/2026 (update yearly)
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-04-21", name: "Easter Monday" },
  { date: "2025-03-30", name: "Eid-el-Fitr (est)" },
  { date: "2025-03-31", name: "Eid-el-Fitr Holiday (est)" },
  { date: "2025-06-06", name: "Eid-el-Kabir (est)" },
  { date: "2025-09-04", name: "Eid-el-Maulud (est)" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-03-20", name: "Eid-el-Fitr (est)" },
  { date: "2026-05-27", name: "Eid-el-Kabir (est)" },
  { date: "2026-08-25", name: "Eid-el-Maulud (est)" },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthDayOf(dateStr: string): string {
  return dateStr.slice(5); // MM-DD
}

export function getTodayHoliday(): HolidayInfo | null {
  const today = todayString();
  const md = monthDayOf(today);

  for (const h of ONE_OFF_HOLIDAYS) {
    if (h.date === today) return h;
  }
  for (const h of NIGERIAN_HOLIDAYS_RECURRING) {
    if (h.monthDay === md) return { date: today, name: h.name, country: "NG" };
  }
  for (const h of GLOBAL_BANK_HOLIDAYS_RECURRING) {
    if (h.monthDay === md)
      return { date: today, name: h.name, country: "global" };
  }
  return null;
}

export function isBusinessDay(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  if (getTodayHoliday()) return false;
  return true;
}

export function getBusinessDayMessage(): string {
  const now = new Date();
  const day = now.getDay();

  if (day === 0) {
    return "Today is Sunday — withdrawals resume Monday (banking day).";
  }
  if (day === 6) {
    return "Today is Saturday — withdrawals resume Monday (banking day).";
  }

  const holiday = getTodayHoliday();
  if (holiday) {
    return `Today is a public holiday (${holiday.name}) — banks are closed. Withdrawals resume the next business day.`;
  }

  return "Withdrawals are available today (Business day)";
}

export function nextBusinessDayLabel(): string {
  const d = new Date();
  for (let i = 1; i <= 10; i++) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    const ds = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const md = ds.slice(5);
    const isHoliday =
      ONE_OFF_HOLIDAYS.some((h) => h.date === ds) ||
      NIGERIAN_HOLIDAYS_RECURRING.some((h) => h.monthDay === md) ||
      GLOBAL_BANK_HOLIDAYS_RECURRING.some((h) => h.monthDay === md);
    if (!isHoliday) {
      return d.toLocaleDateString("en-NG", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    }
  }
  return "the next available business day";
}
