// Europe/Brussels wall-clock helpers (DST-correct, no external lib).
// Must agree with Postgres `(<date> + <hour>) at time zone 'Europe/Brussels'`.

export function brusselsOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Brussels",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// The UTC instant whose Brussels wall-clock time is `dateStr` at `hour` (decimal: 6.5 = 06:30).
export function slotInstant(dateStr, hour) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, Math.round(hour * 60), 0);
  const off = brusselsOffsetMinutes(new Date(guess));
  return new Date(guess - off * 60000);
}

// "06:30" for a decimal hour (6.5 → "06:30").
export function fmtHour(hour) {
  const pad = (n) => String(n).padStart(2, "0");
  const total = Math.round(hour * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

// YYYY-MM-DD for a Date, in Brussels.
export function brusselsDateStr(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// "18:30 – 19:30" for a decimal start hour + duration in minutes.
export function slotRangeLabel(hour, durationMin) {
  const pad = (n) => String(n).padStart(2, "0");
  const startTotal = Math.round(hour * 60);
  const endTotal = startTotal + durationMin;
  return `${pad(Math.floor(startTotal / 60) % 24)}:${pad(startTotal % 60)} – ${pad(Math.floor(endTotal / 60) % 24)}:${pad(endTotal % 60)}`;
}
