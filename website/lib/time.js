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

// The UTC instant whose Brussels wall-clock time is `dateStr` at `hour`:00.
export function slotInstant(dateStr, hour) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const off = brusselsOffsetMinutes(new Date(guess));
  return new Date(guess - off * 60000);
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

// "18:00 – 19:15" for a start hour + duration in minutes.
export function slotRangeLabel(hour, durationMin) {
  const endTotal = hour * 60 + durationMin;
  const eh = Math.floor(endTotal / 60) % 24;
  const em = endTotal % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hour)}:00 – ${pad(eh)}:${pad(em)}`;
}
