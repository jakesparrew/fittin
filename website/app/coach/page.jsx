import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachBookSession, cancelCoachBooking, buyCoachCredits, requestCoachSessions, coachBulkBook } from "./actions";
import SearchSelect from "@/components/admin/SearchSelect";
import ActionForm from "@/components/ui/ActionForm";
import CoachScheduler from "@/components/coach/CoachScheduler";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function CoachDashboard({ searchParams }) {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, profile, gym, userId } = ctx;
  const sp = (await searchParams) || {};

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);

  const [{ data: members }, { data: services }, { data: bookings }, { data: ledger }, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).eq("role", "lid").order("full_name"),
    supabase.from("services").select("id, name, type").eq("gym_id", gym.id).eq("active", true).order("price_cents"),
    supabase.from("bookings").select("id, starts_at, ends_at, persons, status, coach_billing, coach_charge_cents, member:profiles!bookings_user_id_fkey(full_name), services(name)").eq("coach_id", userId).order("starts_at", { ascending: true }),
    supabase.from("coach_ledger").select("delta").eq("coach_id", userId),
    supabase.from("coach_session_requests").select("qty, status, created_at").eq("coach_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);

  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: activity } = await supabase
    .from("coach_activity")
    .select("type, summary, created_at")
    .eq("coach_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  const [{ data: meRef }, { data: commissions }, { count: referredCount }] = await Promise.all([
    supabase.from("profiles").select("referral_code").eq("id", userId).single(),
    supabase.from("coach_commissions").select("amount_cents").eq("coach_id", userId),
    supabase.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", userId),
  ]);
  const commissionTotal = (commissions || []).reduce((a, c) => a + c.amount_cents, 0);
  const refLink = `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/login?mode=signup&ref=${meRef?.referral_code || ""}`;

  const creditBalance = (ledger || []).reduce((a, r) => a + r.delta, 0);
  const all = bookings || [];
  const upcoming = all.filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= Date.now());
  const monthCharges = all
    .filter((b) => b.status === "bevestigd" && b.coach_billing === "invoice" && new Date(b.starts_at) >= monthStart)
    .reduce((a, b) => a + (b.coach_charge_cents || 0), 0);

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);
  const mode = profile.coach_billing_mode;

  // ---- Interactive 14-day planner data (gym-wide taken slots + my own sessions) ----
  const schedFrom = new Date(); schedFrom.setHours(0, 0, 0, 0);
  const schedTo = new Date(schedFrom.getTime() + 14 * 86400000);
  const { data: takenRows } = await supabase.rpc("gym_taken_slots", { p_gym: gym.id, p_from: schedFrom.toISOString(), p_to: schedTo.toISOString() });
  const keyOf = (iso) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date(iso));
    const get = (t) => parts.find((x) => x.type === t)?.value;
    let hh = get("hour"); if (hh === "24") hh = "0";
    return `${get("year")}-${get("month")}-${get("day")}:${parseInt(hh, 10)}`;
  };
  const takenKeys = (takenRows || []).map((t) => keyOf(t.starts_at));
  const mineMap = {};
  for (const b of all) {
    if (b.status === "bevestigd" && new Date(b.starts_at) >= schedFrom) mineMap[keyOf(b.starts_at)] = { name: b.member?.full_name || "Client", service: b.services?.name || "Sessie" };
  }
  const schedDays = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(schedFrom.getTime() + i * 86400000);
    schedDays.push({
      dateStr: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d),
      weekday: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short" }).format(d),
      dayMonth: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d),
    });
  }

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Coach dashboard</h1>
      <p className="mt-1 text-sm text-brand/50">Boek sessies met je clienten en beheer je agenda.</p>

      {sp.gekocht === "1" && <p className="mt-4 rounded-xl bg-accent/15 p-3 text-sm font-semibold text-accentdark">Coach-sessies bijgeschreven ✓</p>}

      {/* Billing summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Aankomende sessies" value={upcoming.length} />
        {mode === "credit" ? (
          <Stat label="Coach-sessies (saldo)" value={creditBalance} accent={creditBalance <= 2} />
        ) : mode === "invoice" ? (
          <Stat label="Te factureren (deze maand)" value={euro(monthCharges)} />
        ) : (
          <Stat label="Facturatie" value="Gratis" accent />
        )}
        <Stat label="Tarief per sessie" value={mode === "free" ? "—" : euro(profile.coach_session_price_cents)} />
      </div>

      {/* Notifications */}
      {(notifs || []).length > 0 && (
        <div className="mt-4 rounded-2xl border border-borderc bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="font-bold text-brand">🔔 Notificaties</p>
            <Link href="/notificaties" className="text-xs font-bold text-accentdark">Alles bekijken →</Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {notifs.map((n) => (
              <Link key={n.id} href={n.link || "/notificaties"} className={"block rounded-xl px-3 py-2 text-sm transition hover:bg-paper " + (n.read ? "" : "bg-accent/5")}>
                <span className="font-bold text-brand">{n.title}</span>
                {n.body && <span className="text-brand/50"> · {n.body}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Affiliate / commissie */}
      <div className="mt-4 rounded-2xl border border-borderc bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-brand">Breng leden aan &amp; verdien</p>
            <p className="mt-0.5 text-xs text-brand/50">Deel je code. Voor elk nieuw lid dat zijn eerste sessie betaalt, verdien je € 5 commissie.</p>
          </div>
          <div className="flex gap-4 text-center">
            <div><p className="text-2xl font-black text-brand">{referredCount || 0}</p><p className="text-[10px] font-bold uppercase tracking-wide text-lav">Aangebracht</p></div>
            <div><p className="text-2xl font-black text-accentdark">{euro(commissionTotal)}</p><p className="text-[10px] font-bold uppercase tracking-wide text-lav">Verdiend</p></div>
          </div>
        </div>
        {meRef?.referral_code && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-paper p-3">
            <span className="text-xs font-bold uppercase tracking-wide text-lav">Jouw code</span>
            <span className="rounded-lg bg-white px-3 py-1 font-black text-brand">{meRef.referral_code}</span>
            <span className="truncate text-xs text-brand/50">{refLink}</span>
          </div>
        )}
      </div>

      {/* Recent activity log */}
      {(activity || []).length > 0 && (
        <div className="mt-4 rounded-2xl border border-borderc bg-white p-5">
          <p className="font-bold text-brand">Recente activiteit</p>
          <div className="mt-3 space-y-1.5 text-sm">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-brand/70">{a.summary}</span>
                <span className="shrink-0 text-xs text-brand/40">{new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(a.created_at))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coaching tools — build your own exercises + program templates, assign to clients */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link href="/coach/programmas" className="flex items-center justify-between rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent">
          <div>
            <p className="font-bold text-brand">Programma's</p>
            <p className="mt-0.5 text-xs text-brand/50">Maak je eigen templates en wijs ze toe aan clienten.</p>
          </div>
          <span className="text-accentdark">→</span>
        </Link>
        <Link href="/coach/oefeningen" className="flex items-center justify-between rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent">
          <div>
            <p className="font-bold text-brand">Oefeningen</p>
            <p className="mt-0.5 text-xs text-brand/50">Bouw je eigen oefeningenbibliotheek op.</p>
          </div>
          <span className="text-accentdark">→</span>
        </Link>
      </div>

      {mode === "credit" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-borderc bg-white p-5">
            <p className="font-bold text-brand">Koop coach-sessies</p>
            <p className="mt-0.5 text-xs text-brand/50">Direct betalen met kaart.</p>
            <form action={buyCoachCredits} className="mt-3 flex items-end gap-2">
              <label className="text-xs font-bold text-lav">Aantal
                <input name="qty" type="number" defaultValue="10" min="1" className="ml-2 w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
              </label>
              <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">Kopen</button>
            </form>
          </div>
          <div className="rounded-2xl border border-borderc bg-white p-5">
            <p className="font-bold text-brand">Of vraag sessies aan</p>
            <p className="mt-0.5 text-xs text-brand/50">De beheerder keurt goed en factureert je later.</p>
            <form action={requestCoachSessions} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-lav">Aantal
                <input name="qty" type="number" defaultValue="10" min="1" className="ml-2 w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
              </label>
              <input name="note" placeholder="notitie (optioneel)" className="flex-1 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
              <button className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white">Aanvragen</button>
            </form>
            {(requests || []).length > 0 && (
              <div className="mt-3 space-y-1 text-xs">
                {requests.map((r, i) => (
                  <p key={i} className="text-brand/50">{r.qty} sessies · <span className={r.status === "approved" ? "font-bold text-accentdark" : r.status === "declined" ? "text-red-500" : "text-brand/60"}>{r.status === "pending" ? "in behandeling" : r.status === "approved" ? "goedgekeurd ✓" : "afgewezen"}</span></p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interactive schedule */}
      <div className="mt-8">
        <CoachScheduler days={schedDays} hours={hours} taken={takenKeys} mine={mineMap} members={members || []} services={services || []} />
      </div>

      {/* Book a session with a client (quick form, alternative to the grid) */}
      <section id="boeken" className="mt-8 scroll-mt-8 rounded-3xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Sessie boeken met een client</h2>
        <form action={coachBookSession} className="mt-4 flex flex-wrap items-end gap-3">
          <Lbl t="Client">
            <SearchSelect name="clientId" required placeholder="Zoek een lid…" options={(members || []).map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
          </Lbl>
          <Lbl t="Sessie">
            <select name="serviceId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              {(services || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Lbl>
          <Lbl t="Datum"><input name="date" type="date" required defaultValue={todayStr} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <Lbl t="Uur">
            <select name="hour" required className="w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
          </Lbl>
          <Lbl t="Pers"><input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">+ Boek sessie</button>
        </form>
        {(!members || members.length === 0) && <p className="mt-3 text-xs text-brand/40">Nog geen clienten/leden in de gym.</p>}
      </section>

      {/* Bulk: plan a recurring series */}
      <section className="mt-8 rounded-3xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Reeks inplannen</h2>
        <p className="mt-1 text-sm text-brand/50">Boek wekelijks dezelfde sessie voor een client (bv. elke maandag om 18u, 8 weken).</p>
        <ActionForm action={coachBulkBook} success="Reeks ingepland ✓" className="mt-4 flex flex-wrap items-end gap-3">
          <Lbl t="Client">
            <select name="clientId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              {(members || []).map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
          </Lbl>
          <Lbl t="Sessie">
            <select name="serviceId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              {(services || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Lbl>
          <Lbl t="Dag">
            <select name="weekday" className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              {[["1", "ma"], ["2", "di"], ["3", "wo"], ["4", "do"], ["5", "vr"], ["6", "za"], ["0", "zo"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Lbl>
          <Lbl t="Uur"><select name="hour" required className="w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
          <Lbl t="Weken"><input name="weeks" type="number" min="1" max="26" defaultValue="8" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <Lbl t="Pers"><input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <button className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white">+ Reeks inplannen</button>
        </ActionForm>
      </section>

      {/* Upcoming sessions */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-brand">Aankomende sessies</h2>
          <Link href="/coach/agenda" className="text-sm font-bold text-accentdark">Volledige agenda →</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-brand/50">Nog geen geplande sessies.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {upcoming.slice(0, 8).map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-4">
                <div>
                  <p className="font-bold text-brand">{b.member?.full_name || "Client"}</p>
                  <p className="mt-0.5 text-sm capitalize text-brand/50">{fmt(b.starts_at)} · {b.services?.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">
                    {b.coach_billing === "free" ? "gratis" : b.coach_billing === "credit" ? "1 sessie" : b.coach_billing === "invoice" ? euro(b.coach_charge_cents) : "—"}
                  </span>
                  <form action={cancelCoachBooking}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <button className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Annuleer</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
    </div>
  );
}
function Lbl({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
