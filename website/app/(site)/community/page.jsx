import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { redeemReferral, signupEvent, cancelSignup } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community | Fittin'" };

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Community() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/community");

  const supabase = await createClient();
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [{ data: myReferral }, { data: myBookings }, { data: challenges }, monthAgg, eventsRes] = await Promise.all([
    supabase.from("referrals").select("id").eq("referred_id", user.id).maybeSingle(),
    supabase.from("bookings").select("starts_at").eq("user_id", user.id).eq("status", "bevestigd"),
    supabase.from("challenges").select("*").eq("gym_id", profile.gym_id).order("created_at", { ascending: false }),
    admin.from("bookings").select("user_id, member:profiles!bookings_user_id_fkey(full_name)").eq("gym_id", profile.gym_id).eq("status", "bevestigd").gte("starts_at", monthStart.toISOString()).lt("starts_at", now.toISOString()),
    admin.from("events").select("*, event_signups(id, user_id)").eq("gym_id", profile.gym_id).gte("starts_at", today.toISOString()).order("starts_at"),
  ]);

  // Leaderboard
  const counts = {};
  for (const b of monthAgg.data || []) {
    const k = b.user_id;
    if (!counts[k]) counts[k] = { name: b.member?.full_name || "Lid", n: 0 };
    counts[k].n++;
  }
  const board = Object.entries(counts).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.n - a.n);
  const myRank = board.findIndex((r) => r.id === user.id);
  const mySessions = (myBookings || []).filter((b) => new Date(b.starts_at) >= monthStart).length;

  const challengeProgress = (c) => {
    const from = c.starts_on ? new Date(c.starts_on) : new Date(0);
    const to = c.ends_on ? new Date(new Date(c.ends_on).getTime() + 86400000) : new Date(8640000000000000);
    return (myBookings || []).filter((b) => {
      const t = new Date(b.starts_at);
      return t >= from && t < to;
    }).length;
  };

  const events = eventsRes.data || [];

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Community</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">Blijf gemotiveerd</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Referral */}
          <section className="rounded-3xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Breng een vriend</h2>
            <p className="mt-1 text-sm text-brand/60">Jullie krijgen allebei een gratis sessie.</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-lav">Jouw code</span>
              <span className="rounded-full bg-brand px-4 py-1.5 font-black tracking-wider text-accent">{profile.referral_code}</span>
            </div>
            {myReferral ? (
              <p className="mt-4 text-sm font-semibold text-accentdark">Je hebt al een vriendcode gebruikt ✓</p>
            ) : (
              <form action={redeemReferral} className="mt-4 flex gap-2">
                <input name="code" placeholder="Code van een vriend" className="flex-1 rounded-xl border-2 border-borderc px-3 py-2 text-sm uppercase" />
                <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">Inwisselen</button>
              </form>
            )}
          </section>

          {/* Leaderboard */}
          <section className="rounded-3xl border border-borderc bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-brand">Leaderboard</h2>
              <span className="text-xs font-bold text-brand/40">deze maand</span>
            </div>
            <div className="mt-4 space-y-2">
              {board.slice(0, 6).map((r, i) => (
                <div key={r.id} className={"flex items-center justify-between rounded-xl px-3 py-2 text-sm " + (r.id === user.id ? "bg-brand text-white" : "bg-paper")}>
                  <span className="flex items-center gap-3">
                    <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs font-black " + (i < 3 ? "bg-accent text-brand" : r.id === user.id ? "bg-white/20" : "bg-white")}>{i + 1}</span>
                    <span className="font-bold">{r.name}</span>
                  </span>
                  <span className="font-black">{r.n} pt</span>
                </div>
              ))}
              {board.length === 0 && <p className="text-sm text-brand/50">Nog geen sessies deze maand. Wees de eerste!</p>}
              {myRank >= 6 && <p className="pt-1 text-center text-xs text-brand/50">Jij: #{myRank + 1} · {mySessions} sessies</p>}
            </div>
          </section>

          {/* Challenges */}
          <section className="rounded-3xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Challenges</h2>
            <div className="mt-4 space-y-3">
              {(challenges || []).map((c) => {
                const prog = Math.min(challengeProgress(c), c.goal_count);
                const pct = c.goal_count ? Math.round((prog / c.goal_count) * 100) : 0;
                return (
                  <div key={c.id} className="rounded-2xl bg-paper p-4">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-brand">{c.name}</span>
                      <span className="text-brand/50">+{c.reward_credits} sessies</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-brand/50">{prog} / {c.goal_count} {c.goal_type}</p>
                  </div>
                );
              })}
              {(!challenges || challenges.length === 0) && <p className="text-sm text-brand/50">Nog geen challenges.</p>}
            </div>
          </section>

          {/* Events */}
          <section className="rounded-3xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Events &amp; groepslessen</h2>
            <div className="mt-4 space-y-3">
              {events.map((ev) => {
                const signups = ev.event_signups || [];
                const mine = signups.find((s) => s.user_id === user.id);
                const full = signups.length >= ev.capacity;
                return (
                  <div key={ev.id} className="rounded-2xl bg-paper p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-brand">{ev.title}</p>
                        <p className="text-xs capitalize text-brand/50">{fmt(ev.starts_at)} · {signups.length}/{ev.capacity}</p>
                      </div>
                      {mine ? (
                        <form action={cancelSignup}>
                          <input type="hidden" name="signupId" value={mine.id} />
                          <button className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand">Uitschrijven</button>
                        </form>
                      ) : (
                        <form action={signupEvent}>
                          <input type="hidden" name="eventId" value={ev.id} />
                          <button disabled={full} className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-brand disabled:opacity-40">
                            {full ? "Vol" : "Inschrijven"}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && <p className="text-sm text-brand/50">Nog geen komende events.</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
