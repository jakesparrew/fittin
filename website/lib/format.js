// Shared formatting helpers — one source of truth. Previously euro()/fmt()/ago() were re-declared
// in ~9 admin files with drifting behaviour (some ago() capped at months, some at years).

const BXL = "Europe/Brussels";

// € 12,50 — cents to a Flemish euro string.
export const euro = (cents) => "€ " + ((cents || 0) / 100).toFixed(2).replace(".", ",");
// € 12 — whole-euro headline (no decimals).
export const euro0 = (cents) => "€ " + Math.round((cents || 0) / 100);

// "za 12 jul, 18:00" — short date + time.
export const fmt = (iso) =>
  iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: BXL, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
// "zaterdag 12 juli" — long date, no time.
export const fmtDay = (iso) =>
  iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: BXL, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso)) : "";
// "12 jul 2026" — compact date.
export const fmtDate = (iso) =>
  iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: BXL, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "";
// "18:00" — time only.
export const fmtTime = (iso) =>
  iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: BXL, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

// "vandaag" / "gisteren" / "3d geleden" / "2 mnd geleden" / "1 jaar geleden".
export function ago(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "vandaag";
  if (d === 1) return "gisteren";
  if (d < 31) return `${d}d geleden`;
  if (d < 365) return `${Math.floor(d / 30)} mnd geleden`;
  const y = Math.floor(d / 365);
  return `${y} jaar geleden`;
}

// Engagement tone from a last-activity ISO date → tailwind text class. Matches the members-table
// convention (red >30d, amber >14d, else muted).
export function tone(iso) {
  if (!iso) return "text-brand/40";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d > 30) return "text-red-500";
  if (d > 14) return "text-amber-500";
  return "text-brand/50";
}
