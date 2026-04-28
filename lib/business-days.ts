// Business day validation utility

export function isBusinessDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // Business days are Monday (1) through Friday (5)
  return day >= 1 && day <= 5;
}

export function getNextBusinessDay(date: Date = new Date()): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  
  // If it lands on Saturday (6) or Sunday (0), skip to Monday
  if (next.getDay() === 0) {
    next.setDate(next.getDate() + 1); // Sunday → Monday
  } else if (next.getDay() === 6) {
    next.setDate(next.getDate() + 2); // Saturday → Monday
  }
  
  return next;
}

export function getDaysUntilNextBusinessDay(): number {
  const today = new Date();
  const today24h = new Date(today);
  today24h.setHours(0, 0, 0, 0);
  
  if (!isBusinessDay(today)) {
    const next = getNextBusinessDay(today);
    const diff = next.getTime() - today24h.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
  
  return 0; // It's already a business day
}

export function getBusinessDayMessage(): string {
  const today = new Date();
  
  if (isBusinessDay(today)) {
    return "Withdrawals are available today (Business day)";
  }
  
  const day = today.getDay();
  const dayName = day === 0 ? "Sunday" : "Saturday";
  const nextBiz = getNextBusinessDay(today);
  const nextBizDay = nextBiz.toLocaleDateString("en-US", { weekday: "long" });
  
  return `Withdrawals available on business days only. It's currently ${dayName}. Next available: ${nextBizDay}, ${nextBiz.toLocaleDateString()}`;
}
