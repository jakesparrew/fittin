// One-off: mirror the OLD site's existing bookings onto the new site as slot_blocks, so those
// times can't be double-booked. A private gym is a single resource, so a booked interval makes
// every overlapping 1h start unavailable. Intervals below were reconstructed from the old site's
// shown "available" slots (the gaps = bookings). Re-runnable: it clears its own previous import first.
//   Usage: node --env-file=.env.local scripts/import-oldsite-blocks.mjs
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GYM = "a3be9855-7f77-40ad-a076-028fe10507b5";
const REASON = "Overgezet van oude site";
const OFFSET = "+02:00"; // Europe/Brussels in June = CEST (UTC+2)

// [date, start, end] in local Brussels time. Booked intervals from the old-site availability:
const BLOCKS = [
  ["2026-06-22", "17:30", "20:30"], // ma 22 (ochtend = verleden, niet geblokkeerd)
  ["2026-06-23", "07:30", "08:30"], // di 23
  ["2026-06-23", "09:30", "10:30"],
  ["2026-06-23", "17:30", "18:30"],
  ["2026-06-23", "21:00", "22:00"],
  ["2026-06-24", "17:30", "19:30"], // wo 24
  ["2026-06-25", "07:30", "08:30"], // do 25
  ["2026-06-25", "18:30", "20:30"],
  ["2026-06-26", "07:30", "11:00"], // vr 26
  ["2026-06-26", "15:30", "16:30"],
  ["2026-06-26", "17:30", "18:30"],
  ["2026-06-27", "09:30", "16:00"], // za 27
  // zo 28: volledig vrij — niets te blokkeren
  ["2026-06-29", "08:00", "09:00"], // ma 29
  ["2026-06-29", "17:30", "20:30"],
  ["2026-06-30", "08:30", "10:30"], // di 30
];

const iso = (d, t) => `${d}T${t}:00${OFFSET}`;
const hhmm = (isoStr) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(isoStr));

// Idempotent: drop the previous import before re-inserting.
const { error: delErr } = await s.from("slot_blocks").delete().eq("gym_id", GYM).eq("reason", REASON);
if (delErr) { console.error("DELETE failed:", delErr.message); process.exit(1); }

const rows = BLOCKS.map(([d, a, b]) => ({ gym_id: GYM, starts_at: iso(d, a), ends_at: iso(d, b), reason: REASON }));
const { data: ins, error } = await s.from("slot_blocks").insert(rows).select("starts_at, ends_at");
if (error) { console.error("INSERT failed:", error.message); process.exit(1); }
console.log(`✓ Inserted ${ins.length} slot_blocks (reason: "${REASON}")\n`);

// Existing real bookings on those days (informational — they also reduce availability).
const days = [...new Set(BLOCKS.map((b) => b[0]))].sort();
const { data: bk } = await s.from("bookings")
  .select("starts_at, ends_at, status")
  .eq("gym_id", GYM).neq("status", "geannuleerd")
  .gte("starts_at", `${days[0]}T00:00:00${OFFSET}`).lte("starts_at", `${days[days.length - 1]}T23:59:59${OFFSET}`);
console.log(`Existing (non-cancelled) bookings on these days: ${(bk || []).length}`);
for (const b of bk || []) console.log(`   ${hhmm(b.starts_at)} → ${hhmm(b.ends_at)} (${b.status})`);

// Cross-check: derive the resulting available 1h starts (06:00–22:00) per day from blocks+bookings.
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const localMin = (isoStr) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(isoStr)); const h = +p.find((x) => x.type === "hour").value, m = +p.find((x) => x.type === "minute").value; return h * 60 + m; };
const dayKey = (isoStr) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(isoStr));

console.log("\n— Resulting availability on the NEW site (compare with your screenshots) —");
for (const day of days) {
  const intervals = BLOCKS.filter((b) => b[0] === day).map(([, a, b]) => [toMin(a), toMin(b)]);
  for (const b of bk || []) if (dayKey(b.starts_at) === day) intervals.push([localMin(b.starts_at), localMin(b.ends_at)]);
  const avail = [];
  for (let st = 6 * 60; st <= 22 * 60; st += 30) {
    const en = st + 60;
    if (!intervals.some(([bs, be]) => st < be && en > bs)) avail.push(`${String(Math.floor(st / 60)).padStart(2, "0")}:${String(st % 60).padStart(2, "0")}`);
  }
  console.log(`${day}: ${avail.join("  ")}`);
}
