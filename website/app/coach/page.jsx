import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachBookSession, buyCoachCredits, requestCoachSessions, coachInviteByEmail } from "./actions";
import SearchSelect from "@/components/admin/SearchSelect";
import CoachScheduler from "@/components/coach/CoachScheduler";
import AddClientInline from "@/components/coach/AddClientInline";
import CoachSlotPicker from "@/components/coach/CoachSlotPicker";
import CoachSessionActions from "@/components/coach/CoachSessionActions";
import CoachChecklist from "@/components/coach/CoachChecklist";
import BookingDetail from "@/components/BookingDetail";
import { fmtHour } from "@/lib/time";
import SubmitButton from "@/components/ui/SubmitButton";
import ActionForm from "@/components/ui/ActionForm";

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

  // ?w paginates the planner two weeks at a time so coaches can plan further ahead.
  const planW = Math.max(0, parseInt(sp.w || "0", 10) || 0);
  const schedFrom = new Date(); schedFrom.setHours(0, 0, 0, 0);
  // Anchor to Monday of the current week so the planner runs maandag→zondag (not "from today").
  const dow = (schedFrom.getDay() + 6) % 7; // 0 = maandag … 6 = zondag
  schedFrom.setDate(schedFrom.getDate() - dow + planW * 14);
  const schedTo = new Date(schedFrom.getTime() + 14 * 86400000);

  // One parallel batch instead of several serial round-trips.
  const [
    { data: clientLinks },
    { data: services },
    { data: bookings },
    { data: ledger },
    { data: requests },
    { data: notifs },
    { data: activity },
    { data: meRef },
    { count: referredCount },
    { data: takenRows },
  ] = await Promise.all([
    supabase.from("coach_clients").select("client:profiles!coach_clients_client_id_fkey(id, full_name, email)").eq("coach_id", userId).eq("status", "accepted"),
    supabase.from("services").select("id, name, type").eq("gym_id", gym.id).eq("active", true).order("price_cents"),
    supabase.from("bookings").select("id, user_id, starts_at, ends_at, persons, status, coach_billing, coach_charge_cents, member:profiles!bookings_user_id_fkey(full_name), services(name)").eq("coach_id", userId).order("starts_at", { ascending: true }),
    supabase.from("coach_ledger").select("delta").eq("coach_id", userId),
    supabase.from("coach_session_requests").select("qty, status, created_at").eq("coach_id", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("notifications").select("id, type, title, body, link, read, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
    supabase.from("coach_activity").select("type, summary, created_at").eq("coach_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("referral_code").eq("id", userId).single(),
    supabase.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", userId),
    supabase.rpc("gym_taken_slots", { p_gym: gym.id, p_from: schedFrom.toISOString(), p_to: schedTo.toISOString() }),
  ]);
  const refLink = `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/login?mode=signup&ref=${meRef?.referral_code || ""}`;
  // Only verbonden (accepted) clients are bookable. New clients are connected via /coach/clienten.
  const members = (clientLinks || []).map((l) => l.client).filter(Boolean).sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));

  const creditBalance = (ledger || []).reduce((a, r) => a + r.delta, 0);
  const all = bookings || [];
  const upcoming = all.filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= Date.now());
  const monthCharges = all
    .filter((b) => b.status === "bevestigd" && b.coach_billing === "invoice" && new Date(b.starts_at) >= monthStart)
    .reduce((a, b) => a + (b.coach_charge_cents || 0), 0);

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h += 0.5) hours.push(h);
  const mode = profile.coach_billing_mode;
  // Coaches only book PT — show it as a fixed label, not a dropdown.
  const ptServices = (services || []).filter((s) => s.type === "pt");
  const ptService = ptServices[0] || (services || [])[0];

  // ---- Interactive 14-day planner data (gym-wide taken slots + my own sessions) ----
  const keyOf = (iso) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
    const get = (t) => parts.find((x) => x.type === t)?.value;
    let hh = get("hour"); if (hh === "24") hh = "0";
    const dec = parseInt(hh, 10) + (parseInt(get("minute"), 10) >= 30 ? 0.5 : 0);
    return `${get("year")}-${get("month")}-${get("day")}:${dec}`;
  };
  const takenKeys = (takenRows || []).map((t) => keyOf(t.starts_at));
  const mineMap = {};
  for (const b of all) {
    if (b.status === "bevestigd" && new Date(b.starts_at) >= schedFrom) mineMap[keyOf(b.starts_at)] = { name: b.user_id === userId ? "Gereserveerd" : (b.member?.full_name || "Client"), service: b.services?.name || "Sessie" };
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Coach dashboard</h1>
          <p className="mt-1 text-sm text-brand/50">Boek sessies met je clienten en beheer je agenda.</p>
        </div>
        <Link href="/community" className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">💡 Deel een tip in de feed →</Link>
      </div>

      {sp.gekocht === "1" && <p className="mt-4 rounded-xl bg-accent/15 p-3 text-sm font-semibold text-accentdark">Coach-sessies bijgeschreven ✓</p>}

      {/* First-run checklist (Batch 2.8) — only for real coaches, not the beheerder "view as" mode. */}
      {!ctx.viewingAs && (
        <CoachChecklist steps={[
          { label: "Voeg een profielfoto toe", done: !!profile.coach_photo_url, hint: "Een gezicht schept vertrouwen.", href: "/coach/profiel", cta: "Naar profiel" },
          { label: "Schrijf een korte bio", done: !!String(profile.coach_bio || "").trim(), hint: "Vertel over je aanpak en ervaring.", href: "/coach/profiel", cta: "Naar profiel" },
          { label: "Stel je tarieven in", done: !!profile.coach_pt_price_cents, hint: "Prijs voor 1-op-1 personal training.", href: "/coach/profiel", cta: "Naar profiel" },
          { label: "Zet jezelf zichtbaar op de site", done: !!profile.coach_public, hint: "Verschijn op /coaches zodat leden je vinden.", href: "/coach/profiel", cta: "Naar profiel" },
          { label: "Koop je eerste sessietegoed", done: creditBalance > 0, hint: "Nodig om sessies met clienten te boeken.", href: "#tegoed", cta: "Koop tegoed" },
        ]} />
      )}

      {/* PRIMARY ACTION — book a session with a client */}
      <section id="boeken" className="mt-6 scroll-mt-8 rounded-3xl border-2 border-accent bg-white p-6 shadow-sm shadow-accent/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black text-brand">Sessie boeken met een client</h2>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-black text-accentdark">Hoofdactie</span>
        </div>
        <p className="mt-1 text-sm text-brand/60">Kies je client en moment. Elke boeking kost jou <strong>1 sessietegoed (€ 12 aan de gym)</strong>, ongeacht het aantal personen. De prijs die je je client(en) aanrekent, reken je apart af.</p>
        <Link href="/coach/clienten" className="mt-1 inline-block text-xs font-bold text-accentdark hover:underline">Zie je je client niet in de lijst? Verbind je clienten hier →</Link>
        {members.length === 0 && (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 p-4 text-sm">
            <p className="font-bold text-brand">Je hebt nog geen verbonden clienten.</p>
            <p className="mt-0.5 text-brand/60">Verbind eerst een client via <Link href="/coach/clienten" className="font-bold text-accentdark underline">Mijn clienten</Link> — pas daarna kan je hier een sessie met hen boeken.</p>
          </div>
        )}
        <ActionForm action={coachBookSession} success="Sessie geboekt ✓" className="mt-4 flex flex-wrap items-end gap-3">
          <Lbl t="Client (optioneel)">
            <SearchSelect name="clientId" placeholder="Zoek een lid…" options={(members || []).map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
          </Lbl>
          <Lbl t="Sessie">
            <div className="rounded-lg border-2 border-borderc bg-paper px-3 py-2 text-sm font-semibold text-brand">{ptService?.name || "Personal training"}</div>
            <input type="hidden" name="serviceId" value={ptService?.id || ""} />
          </Lbl>
          <CoachSlotPicker defaultDate={todayStr} openHour={gym.open_hour} closeHour={gym.close_hour} />
          <Lbl t="Pers"><input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <SubmitButton className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">+ Boek sessie</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-brand/50">Tip: laat <strong>Client</strong> leeg om enkel het uur te reserveren. Je kan later bij de sessie een client toevoegen via <strong>+ Client toevoegen</strong>.</p>
        <AddClientInline />
        <p className="mt-2 text-xs text-brand/40">Groepstraining? Verhoog "Pers" — je betaalt nog steeds 1 sessietegoed (€ 12). Je clienten betalen jou rechtstreeks (bv. Bancontact), los van het platform.</p>
      </section>

      {/* Billing summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Aankomende sessies" value={upcoming.length} />
        {mode === "credit" ? (
          <Stat label="Coach-sessies (saldo)" value={creditBalance} accent={creditBalance > 0 && creditBalance <= 2} />
        ) : mode === "invoice" ? (
          <Stat label="Te factureren (deze maand)" value={euro(monthCharges)} />
        ) : (
          <Stat label="Facturatie" value="Gratis" accent />
        )}
        <Stat label="Tarief per sessie" value={mode === "free" ? "—" : euro(profile.coach_session_price_cents)} />
      </div>

      {/* Coach-sessies kopen — bovenaan zodat je je saldo snel kan aanvullen */}
      {mode === "credit" && (
        <div id="tegoed" className="mt-4 grid gap-4 scroll-mt-8 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-accent bg-accent/5 p-5">
            <div className="flex items-center gap-2">
              <span className="text-xl">💳</span>
              <p className="text-lg font-black text-brand">Coach-sessies kopen</p>
            </div>
            <p className="mt-1 text-sm text-brand/60">
              Coaches betalen altijd <strong className="text-brand">€ 12 per sessie</strong>. Koop 1 tot 100 sessies vooraf en boek daarna je clienten met dit saldo.
            </p>
            <ActionForm action={buyCoachCredits} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block text-xs font-bold text-lav">Aantal sessies (1–100)
                <input name="qty" type="number" defaultValue="10" min="1" max="100" className="mt-1 block w-24 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
              <SubmitButton className="rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand">Naar de kassa →</SubmitButton>
            </ActionForm>
          </div>
          <div className="rounded-2xl border border-borderc bg-white p-5">
            <p className="font-bold text-brand">Of vraag sessies aan</p>
            <p className="mt-0.5 text-xs text-brand/50">De beheerder keurt goed en factureert je later.</p>
            <ActionForm action={requestCoachSessions} success="Aanvraag verstuurd ✓" className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-lav">Aantal
                <input name="qty" type="number" defaultValue="10" min="1" max="100" className="ml-2 w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
              </label>
              <input name="note" placeholder="notitie (optioneel)" className="flex-1 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
              <SubmitButton className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white">Aanvragen</SubmitButton>
            </ActionForm>
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

      {/* Notifications */}
      {(notifs || []).length > 0 && (
        <div className="mt-4 rounded-2xl border border-borderc bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="font-bold text-brand">🔔 Notificaties</p>
            <Link href="/coach/notificaties" className="text-xs font-bold text-accentdark">Alles bekijken →</Link>
          </div>
          <div className="mt-3 space-y-1.5">
            {notifs.map((n) => (
              <Link key={n.id} href="/coach/notificaties" className={"block rounded-xl px-3 py-2 text-sm transition hover:bg-paper " + (n.read ? "" : "bg-accent/5")}>
                <span className="font-bold text-brand">{n.title}</span>
                {n.body && <span className="text-brand/50"> · {n.body}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Referral — bring members along, earn a free invite session (no cash commission) */}
      <div className="mt-4 rounded-2xl border border-borderc bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-brand">Breng leden aan</p>
            <p className="mt-0.5 text-xs text-brand/50">Deel je code. Voor elk nieuw lid dat zijn eerste sessie boekt, krijg jij een gratis introsessie om samen te trainen.</p>
          </div>
          <div className="flex gap-4 text-center">
            <div><p className="text-2xl font-black text-brand">{referredCount || 0}</p><p className="text-[10px] font-bold uppercase tracking-wide text-lav">Aangebracht</p></div>
          </div>
        </div>
        {/* Invite by e-mail — auto-sends the invite with your referral code */}
        <ActionForm action={coachInviteByEmail} success="Uitnodiging verstuurd ✓" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Nodig een lid uit via e-mail</span>
            <input name="email" type="email" required placeholder="naam@voorbeeld.be" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand transition hover:opacity-90">Verstuur uitnodiging</button>
        </ActionForm>
        {meRef?.referral_code && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-paper p-3">
            <span className="text-xs font-bold uppercase tracking-wide text-lav">Of deel je code</span>
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

      {/* Interactive schedule */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black text-brand">Planning</h2>
          <div className="flex items-center gap-2 text-sm font-bold">
            {planW > 0 ? (
              <Link href={`/coach?w=${planW - 1}`} className="rounded-full border-2 border-borderc px-4 py-1.5 hover:border-lav">←</Link>
            ) : (
              <span className="rounded-full border-2 border-borderc px-4 py-1.5 opacity-30">←</span>
            )}
            <span className="text-brand/60">{schedDays[0].dayMonth} – {schedDays[13].dayMonth}</span>
            <Link href={`/coach?w=${planW + 1}`} className="rounded-full border-2 border-borderc px-4 py-1.5 hover:border-lav">→</Link>
          </div>
        </div>
        <CoachScheduler days={schedDays} hours={hours} taken={takenKeys} mine={mineMap} members={members || []} services={ptServices} />
      </div>

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
            {upcoming.slice(0, 8).map((b) => {
              const reserved = b.user_id === userId; // slot booked without a client yet
              return (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-4">
                <div>
                  <p className="font-bold text-brand"><BookingDetail bookingId={b.id} className="font-bold text-brand">{reserved ? "Gereserveerd · nog geen client" : (b.member?.full_name || "Client")}</BookingDetail></p>
                  <p className="mt-0.5 text-sm capitalize text-brand/50">{fmt(b.starts_at)} · {b.services?.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">
                    {b.coach_billing === "free" ? "gratis" : b.coach_billing === "credit" ? "1 sessie" : b.coach_billing === "invoice" ? euro(b.coach_charge_cents) : "—"}
                  </span>
                  <CoachSessionActions bookingId={b.id} startsAt={b.starts_at} reserved={reserved} clients={(members || []).map((m) => ({ id: m.id, label: m.full_name || m.email }))} />
                </div>
              </div>
              );
            })}
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
