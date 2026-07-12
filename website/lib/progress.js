import { createAdminClient } from "@/lib/supabase/admin";

// Aggregate a member's workout progress from workout_logs + body_metrics for the /voortgang panel.
// Read via the service role but STRICTLY scoped to the given userId (their own page): this also
// resolves exercise names for public-workout logs the member can't read through RLS embeds.

const asSets = (sj) => (Array.isArray(sj) ? sj : sj && typeof sj === "object" ? [sj] : []);
// Volume of one log: object form {sets,reps,weight_kg} → sets*reps*w; array form → sum of reps*w.
export function logVolume(sj) {
  let v = 0;
  for (const s of asSets(sj)) {
    if (!s || typeof s !== "object") continue;
    const reps = Number(s.reps) || 0, w = Number(s.weight_kg) || 0, sets = Number(s.sets) || 1;
    v += sets * reps * w;
  }
  return Math.round(v);
}
export const logTopWeight = (sj) => asSets(sj).reduce((m, s) => Math.max(m, Number(s?.weight_kg) || 0), 0);

const dayStr = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
function weekStart(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function getMemberProgress(userId) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const [{ data: logs }, { data: weights }] = await Promise.all([
    admin
      .from("workout_logs")
      .select("logged_on, sets_json, is_pr, program_exercises(exercises(name))")
      .eq("user_id", userId)
      .gte("logged_on", since)
      .order("logged_on", { ascending: true })
      .limit(1000),
    admin
      .from("body_metrics")
      .select("logged_on, weight_kg")
      .eq("user_id", userId)
      .order("logged_on", { ascending: true })
      .limit(180),
  ]);

  const L = logs || [];
  const nameOf = (l) => l.program_exercises?.exercises?.name || null;

  // ---- weekly volume + sessions (last 10 weeks, gaps filled) ----
  const volByWeek = {}, daysByWeek = {};
  const allDays = new Set();
  for (const l of L) {
    const wk = weekStart(l.logged_on);
    volByWeek[wk] = (volByWeek[wk] || 0) + logVolume(l.sets_json);
    (daysByWeek[wk] ||= new Set()).add(l.logged_on);
    allDays.add(l.logged_on);
  }
  const weeks = [];
  const cur = new Date(weekStart(dayStr(new Date())) + "T12:00:00Z");
  for (let i = 9; i >= 0; i--) {
    const d = new Date(cur.getTime() - i * 7 * 86400000);
    const wk = d.toISOString().slice(0, 10);
    weeks.push({
      week: wk,
      label: new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(d),
      volume: volByWeek[wk] || 0,
      sessions: daysByWeek[wk]?.size || 0,
    });
  }

  // ---- weekly streak (consecutive weeks with ≥1 session, ending at the most recent active week) ----
  let streak = 0;
  {
    let d = new Date(cur.getTime());
    // allow the streak to "hold" if this week is empty but last week was active
    if (!(daysByWeek[d.toISOString().slice(0, 10)]?.size)) d = new Date(d.getTime() - 7 * 86400000);
    while (daysByWeek[d.toISOString().slice(0, 10)]?.size) { streak++; d = new Date(d.getTime() - 7 * 86400000); }
  }

  // ---- PR timeline (most recent first) ----
  const prs = L.filter((l) => l.is_pr && nameOf(l))
    .map((l) => ({ name: nameOf(l), weight: logTopWeight(l.sets_json), date: l.logged_on }))
    .filter((p) => p.weight > 0)
    .reverse()
    .slice(0, 8);

  // ---- top exercises: most-logged, each a per-session max-weight series ----
  const byName = {};
  for (const l of L) {
    const n = nameOf(l);
    if (!n) continue;
    const w = logTopWeight(l.sets_json);
    if (w <= 0) continue; // skip bodyweight/done-only for the weight chart
    const e = (byName[n] ||= { name: n, byDay: {} });
    e.byDay[l.logged_on] = Math.max(e.byDay[l.logged_on] || 0, w);
  }
  const topExercises = Object.values(byName)
    .map((e) => {
      const pts = Object.entries(e.byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([date, w]) => ({ date, w }));
      return { name: e.name, points: pts, best: Math.max(...pts.map((p) => p.w)) };
    })
    .filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 3);

  // ---- bodyweight line ----
  const bodyweight = (weights || []).map((w) => ({ date: w.logged_on, kg: Number(w.weight_kg) })).filter((p) => p.kg > 0);

  return {
    hasData: L.length > 0,
    totals: { sessions: allDays.size, prs: L.filter((l) => l.is_pr).length },
    streak,
    weeks,
    prs,
    topExercises,
    bodyweight,
  };
}
