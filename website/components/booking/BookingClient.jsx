"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBookingAction, searchMembersAction, validateDiscountAction } from "@/app/(site)/boeken/actions";
import { slotInstant, brusselsDateStr, slotRangeLabel, fmtHour } from "@/lib/time";
import EventsBooking from "@/components/booking/EventsBooking";

const euro = (cents) => "€ " + (cents / 100).toFixed(2).replace(".", ",");

export default function BookingClient({
  gym,
  services,
  takenSlots = [],
  coaches = [],
  availability = [],
  isLoggedIn,
  welcomeAvailable,
  creditBalance = 0,
  isMember = false,
  paymentCanceled = false,
  buddies = [],
  events = [],
}) {
  const router = useRouter();
  const [mode, setMode] = useState("session"); // session | events
  const [serviceId, setServiceId] = useState(
    (services.find((s) => s.type === "fit60") || services[0])?.id
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const [showNight, setShowNight] = useState(false);
  const [mobileDay, setMobileDay] = useState(null);
  const [selected, setSelected] = useState(null); // { dateStr, hour } — hour is decimal (6.5 = 06:30)
  const [persons, setPersons] = useState(1);
  const [duration, setDuration] = useState(1);
  const [coachId, setCoachId] = useState(coaches[0]?.id || "");
  const [useWelcome, setUseWelcome] = useState(welcomeAvailable);
  const [useCredit, setUseCredit] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountInfo, setDiscountInfo] = useState(null); // {ok,cents,off,label} | {error}
  const [applyingCode, setApplyingCode] = useState(false);
  const [buddySel, setBuddySel] = useState([]);
  const [invitees, setInvitees] = useState([]); // [{id,name}] members to bring along
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [emailInvitees, setEmailInvitees] = useState([]); // [email] non-members invited by e-mail
  const [emailInput, setEmailInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);

  const service = services.find((s) => s.id === serviceId) || services[0];
  const isFit60 = service?.type === "fit60";
  const isPT = service?.type === "pt";
  // Reset the person count when the service changes (gym-persons vs PT-formule mean different things).
  useEffect(() => { setPersons(1); }, [serviceId]);

  const days = useMemo(() => {
    const out = [];
    const base = Date.now() + weekOffset * 7 * 86400000;
    for (let i = 0; i < 7; i++) {
      const d = new Date(base + i * 86400000);
      out.push({
        dateStr: brusselsDateStr(d),
        weekday: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short" }).format(d),
        dayMonth: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d),
      });
    }
    return out;
  }, [weekOffset]);

  const takenSet = useMemo(() => new Set(takenSlots.map((s) => new Date(s).getTime())), [takenSlots]);

  const allHours = useMemo(() => {
    const list = [];
    for (let h = gym.open_hour; h < gym.close_hour; h += 0.5) list.push(h);
    return list;
  }, [gym.open_hour, gym.close_hour]);
  // Very-long (24/7) ranges get a daytime default + night toggle so the grid fits; normal
  // opening hours (e.g. 6–23) just show every bookable hour.
  const hasNight = allHours.some((h) => h < 6 || h >= 23);
  const hours = !hasNight || showNight ? allHours : allHours.filter((h) => h >= 7 && h < 22);
  const activeDay = (days.find((d) => d.dateStr === mobileDay) || days[0])?.dateStr;

  // Restore a slot chosen BEFORE signup (guest picks a moment → creates account → lands back on
  // /boeken?d=…&h=…): re-select it so the biggest funnel seam doesn't drop their choice. Only when
  // the slot is still actually bookable.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("d");
    const h = parseFloat(sp.get("h"));
    if (!d || Number.isNaN(h)) return;
    const u = Math.min(4, Math.max(1, parseInt(sp.get("u"), 10) || 1));
    if (!days.some((x) => x.dateStr === d) || !canBook(d, h, u)) return;
    setSelected({ dateStr: d, hour: h });
    setMobileDay(d);
    setDuration(u);
    const p = parseInt(sp.get("p"), 10);
    if (p >= 1 && p <= 4) setPersons(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function coachOpen(dateStr, h) {
    if (!isPT || !coachId) return true;
    const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return availability.some((a) => a.coach_id === coachId && a.weekday === wd && a.from_hour <= h && h < a.to_hour);
  }

  // Is one 30-min slot bookable (free + open + future)?
  function slotFree(dateStr, h) {
    const t = slotInstant(dateStr, h).getTime();
    return !takenSet.has(t) && t >= Date.now() && coachOpen(dateStr, h);
  }
  // Can a booking of `dur` whole hours START at half-hour slot h? Every 30-min slice in
  // [h, h+dur) must be free and the whole thing must fit before closing time.
  function canBook(dateStr, h, dur) {
    if (h + dur > gym.close_hour) return false;
    for (let s = h; s < h + dur - 1e-9; s += 0.5) if (!slotFree(dateStr, s)) return false;
    return true;
  }

  const welcomeApplies = isFit60 && welcomeAvailable && useWelcome && duration === 1;
  const creditApplies = isFit60 && !welcomeApplies && useCredit && creditBalance >= duration;
  const durFactor = 1; // geen korting op langere sessies — je betaalt (en gebruikt) 1 credit per uur
  // Members book Fit60 at the member price; PT uses the chosen coach's per-formule rate (matches the
  // server): 1-op-1 = coach_pt_price_cents, 1-op-2/1-op-3 = prijs per persoon → totaal = tarief × personen.
  const memberRate = isFit60 && isMember && service?.member_price_cents != null;
  const ptCoach = isPT && coachId ? coaches.find((c) => c.id === coachId) : null;
  const ptByPersons = ptCoach ? (persons >= 3 ? ptCoach.coach_pt3_price_cents : persons === 2 ? ptCoach.coach_pt2_price_cents : ptCoach.coach_pt_price_cents) : null;
  const ptUnit = (ptByPersons != null ? ptByPersons : ptCoach?.coach_pt_price_cents) ?? (service?.price_cents ?? 0);
  const unitCents = memberRate ? service.member_price_cents : (isPT ? ptUnit : (service?.price_cents ?? 0));
  const priceCents = welcomeApplies || creditApplies ? 0
    : isPT ? Math.round(ptUnit * persons * duration)
    : Math.round(unitCents * (isFit60 ? duration : 1) * (isFit60 ? durFactor : 1));

  // Invite slots = the booking's free spots (persons − you). Members + e-mail invites share them.
  const inviteSlots = isFit60 ? Math.max(0, persons - 1) : 0;
  const usedInvites = invitees.length + emailInvitees.length;
  const addEmailInvite = () => {
    const e = emailInput.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && usedInvites < inviteSlots && !emailInvitees.includes(e)) {
      setEmailInvitees((s) => [...s, e]);
      setEmailInput("");
    }
  };

  async function submit() {
    if (!selected || !service) return;
    setBusy(true);
    setError("");
    let res;
    try {
      res = await createBookingAction({
      serviceId: service.id,
      date: selected.dateStr,
      hour: selected.hour,
      hours: isFit60 ? duration : 1,
      persons: isFit60 || isPT ? persons : 1,
      useWelcome: welcomeApplies,
      coachId: isPT ? coachId : null,
      useCredit: creditApplies,
      discountCode: !welcomeApplies && !creditApplies ? discountCode.trim() : "",
      participantIds: invitees.map((i) => i.id),
      emailInvites: emailInvitees,
      });
    } catch {
      setBusy(false);
      setError("Er ging iets mis bij het boeken. Controleer je verbinding en probeer opnieuw.");
      return;
    }
    if (res?.error) {
      setBusy(false);
      setError(res.error);
      router.refresh();
      return;
    }
    if (res?.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }
    setBusy(false);
    const day = days.find((d) => d.dateStr === selected.dateStr);
    setConfirmed({
      service: service.name,
      day: day ? `${day.weekday} ${day.dayMonth}` : selected.dateStr,
      range: slotRangeLabel(selected.hour, (isFit60 ? duration : 1) * 60),
      persons: isFit60 || isPT ? persons : 1,
      free: welcomeApplies,
    });
    router.refresh();
  }

  if (confirmed) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24">
        <div className="rounded-3xl border border-borderc bg-white p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-3xl font-black text-brand">✓</div>
          <h1 className="mt-6 text-3xl font-black">Boeking bevestigd!</h1>
          <p className="mt-3 leading-relaxed text-brand/70">
            {confirmed.service} · {confirmed.day} · {confirmed.range} · {confirmed.persons}{" "}
            {confirmed.persons === 1 ? "persoon" : "personen"}
            {confirmed.free && " · gratis (FittinWelcome)"}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/account" className="rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:opacity-90">Naar mijn account</Link>
            <button onClick={() => { setConfirmed(null); setSelected(null); }} className="rounded-full border-2 border-borderc px-7 py-3.5 font-bold text-brand transition hover:border-lav">Nieuwe boeking</button>
          </div>
        </div>
      </main>
    );
  }

  const weekLabel = `${days[0].dayMonth} – ${days[6].dayMonth}`;

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Link href={isLoggedIn ? "/account" : "/"} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand/60 transition hover:text-brand">← {isLoggedIn ? "Terug naar account" : "Terug naar home"}</Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-lav">Online boeken</p>
        <h1 className="mt-3 text-3xl font-black md:text-4xl">Reserveer je sessie</h1>
        {welcomeAvailable ? (
          <p className="mt-3 max-w-xl text-brand/70">
            Welkom! Je eerste Fit60-sessie is <span className="font-bold text-accentdark">gratis</span> met{" "}
            <span className="rounded-full bg-brand px-3 py-0.5 font-bold text-accent">FittinWelcome</span>.
          </p>
        ) : (
          <p className="mt-3 max-w-xl text-brand/70">De hele zaal is van jou tijdens je boeking — open van {gym.open_hour}u tot {gym.close_hour}u, kies je moment.</p>
        )}
        {paymentCanceled && (
          <p className="mt-4 rounded-2xl bg-accent/10 p-4 text-sm font-semibold text-accentdark">
            Betaling geannuleerd. Kies gerust opnieuw een moment.
          </p>
        )}

        {/* Events feature is "coming soon" — only session booking is active. */}
        {mode === "events" ? (
          <EventsBooking events={events} isLoggedIn={isLoggedIn} />
        ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Service */}
            <Card step="1" title="Kies je sessie">
              <div className="grid gap-4 sm:grid-cols-3">
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setServiceId(s.id); setSelected(null); }}
                    className={"rounded-2xl border-2 p-5 text-left transition " + (serviceId === s.id ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}
                  >
                    <p className="font-black">{s.name}</p>
                    {s.type === "fit60" && isMember && s.member_price_cents != null ? (
                      <p className="mt-1 text-sm text-brand/60">{s.duration_min} min · <span className="font-bold text-accentdark">{euro(s.member_price_cents)}</span> <span className="text-brand/40 line-through">{euro(s.price_cents)}</span> <span className="font-bold text-accentdark">ledenprijs</span></p>
                    ) : (
                      <p className="mt-1 text-sm text-brand/60">{s.duration_min} min · {s.type === "fit60" ? euro(s.price_cents) : "op aanvraag"}</p>
                    )}
                  </button>
                ))}
              </div>
            </Card>

            {/* Coach (PT) */}
            {isPT && (
              <Card step="•" title="Kies je coach">
                {coaches.length === 0 ? (
                  <p className="text-sm text-brand/50">Nog geen coaches beschikbaar — neem contact op.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {coaches.map((c) => (
                      <button key={c.id} onClick={() => { setCoachId(c.id); setSelected(null); }} className={"rounded-2xl border-2 p-4 text-left text-sm font-bold transition " + (coachId === c.id ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                        {c.full_name || "Coach"}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Schedule grid */}
            <Card step="2" title="Kies je moment">
              <div className="mb-3 flex items-center justify-between">
                <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0} className="rounded-full border-2 border-borderc px-4 py-1.5 text-sm font-bold text-brand transition enabled:hover:border-lav disabled:opacity-30">‹ vorige</button>
                <span className="text-sm font-bold text-brand/60">{weekLabel}</span>
                <button onClick={() => setWeekOffset((w) => Math.min(8, w + 1))} className="rounded-full border-2 border-borderc px-4 py-1.5 text-sm font-bold text-brand transition hover:border-lav">volgende ›</button>
              </div>

              {/* Mobiel: dagkiezer + tijdslots in 1 kolom — geen horizontale scroll */}
              <div className="md:hidden">
                <div className="grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const act = activeDay === d.dateStr;
                    return (
                      <button key={d.dateStr} onClick={() => setMobileDay(d.dateStr)} className={"rounded-xl border-2 py-1.5 text-center transition " + (act ? "border-accent bg-accent/15" : "border-borderc")}>
                        <span className="block text-[9px] font-bold uppercase text-brand/40">{d.weekday}</span>
                        <span className="block text-xs font-black text-brand">{d.dayMonth.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {hours.map((h) => {
                    const t = slotInstant(activeDay, h).getTime();
                    const taken = takenSet.has(t);
                    const past = t < Date.now();
                    const closed = !coachOpen(activeDay, h);
                    const inRange = selected && selected.dateStr === activeDay && h >= selected.hour && h < selected.hour + (isFit60 ? duration : 1);
                    const isSel = selected && selected.dateStr === activeDay && selected.hour === h;
                    const label = fmtHour(h);
                    if (past || closed) return <div key={h} className="rounded-xl bg-paper py-3 text-center text-xs font-bold text-brand/25">{label}</div>;
                    if (taken) return <div key={h} className="rounded-xl bg-borderc/40 py-3 text-center text-[10px] font-bold leading-tight text-brand/35">{label}<br />vol</div>;
                    if (!inRange && !canBook(activeDay, h, 1)) return <div key={h} className="rounded-xl bg-paper py-3 text-center text-xs font-bold text-brand/20">{label}</div>;
                    return (
                      <button key={h} onClick={() => { setSelected({ dateStr: activeDay, hour: h }); setDuration(1); }} className={"rounded-xl border-2 py-3 text-center text-xs font-black transition " + (inRange ? "border-accent bg-accent text-brand" : "border-accent/30 bg-accent/10 text-accentdark")}>
                        {label}{isSel ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
                {hours.length === 0 && <p className="mt-2 text-xs text-brand/40">Geen vrije uren op deze dag.</p>}
              </div>

              {/* Desktop: volledige weekrooster */}
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[620px]">
                  {/* header */}
                  <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-1">
                    <div />
                    {days.map((d) => (
                      <div key={d.dateStr} className="pb-1 text-center">
                        <p className="text-[10px] font-bold uppercase text-brand/40">{d.weekday}</p>
                        <p className="text-xs font-black text-brand">{d.dayMonth}</p>
                      </div>
                    ))}
                  </div>
                  {/* rows */}
                  <div>
                    {hours.map((h) => (
                      <div key={h} className="grid grid-cols-[44px_repeat(7,1fr)] gap-1 py-0.5">
                        <div className="flex items-center justify-end pr-1 text-[10px] font-bold text-brand/30">{fmtHour(h)}</div>
                        {days.map((d) => {
                          const t = slotInstant(d.dateStr, h).getTime();
                          const taken = takenSet.has(t);
                          const past = t < Date.now();
                          const closed = !coachOpen(d.dateStr, h);
                          const inRange = selected && selected.dateStr === d.dateStr && h >= selected.hour && h < selected.hour + (isFit60 ? duration : 1);
                          const isSel = selected && selected.dateStr === d.dateStr && selected.hour === h;
                          if (past || closed) return <div key={d.dateStr} className="h-7 rounded-md bg-paper" />;
                          if (taken) return <div key={d.dateStr} className="flex h-7 items-center justify-center rounded-md bg-borderc/40 text-[9px] font-bold text-brand/30">vol</div>;
                          if (!inRange && !canBook(d.dateStr, h, 1)) return <div key={d.dateStr} className="h-7 rounded-md bg-paper/60" />;
                          return (
                            <button
                              key={d.dateStr}
                              onClick={() => { setSelected({ dateStr: d.dateStr, hour: h }); setDuration(1); }}
                              className={"h-7 select-none rounded-md border text-[9px] font-bold transition " + (inRange ? "border-accent bg-accent text-brand" : "border-accent/30 bg-accent/10 text-accentdark hover:bg-accent/25")}
                            >
                              {isSel ? "✓" : inRange ? "•" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-brand/40">Groen = vrij · grijs = geboekt · de zaal is exclusief van jou tijdens je sessie.</p>
                {hasNight && (
                  <button onClick={() => setShowNight((s) => !s)} className={"inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-xs font-black transition " + (showNight ? "border-brand bg-brand text-white" : "border-accent bg-accent/15 text-accentdark hover:bg-accent/30")}>
                    🌙 {showNight ? "Verberg nachturen" : "Toon nachturen (22u–7u)"}
                  </button>
                )}
              </div>
            </Card>

            {/* PT formule (1-op-1 / 1-op-2 / 1-op-3) met het tarief van de gekozen coach */}
            {isPT && (
              <Card step="3" title="Kies je formule">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { n: 1, label: "1-op-1", price: ptCoach?.coach_pt_price_cents, per: "" },
                    { n: 2, label: "1-op-2", price: ptCoach?.coach_pt2_price_cents, per: "p.p." },
                    { n: 3, label: "1-op-3", price: ptCoach?.coach_pt3_price_cents, per: "p.p." },
                  ].map((f) => {
                    const offered = !ptCoach || f.n === 1 || f.price != null;
                    return (
                      <button key={f.n} type="button" disabled={!offered} onClick={() => offered && setPersons(f.n)}
                        className={"rounded-2xl border-2 p-4 text-left transition disabled:opacity-40 " + (persons === f.n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                        <span className="block text-sm font-black text-brand">{f.label}</span>
                        <span className="mt-0.5 block text-xs text-brand/55">{f.price != null ? `${euro(f.price)}${f.per ? " " + f.per : ""}` : (ptCoach ? "op aanvraag" : "—")}</span>
                      </button>
                    );
                  })}
                </div>
                {ptCoach && (
                  <p className="mt-3 text-xs text-brand/50">
                    1-op-2 en 1-op-3 zijn prijs per persoon. Totaal: <span className="font-bold text-brand">{euro(priceCents)}</span> voor {persons} {persons === 1 ? "persoon" : "personen"}.
                  </p>
                )}
              </Card>
            )}

            {/* Persons */}
            {isFit60 && (
              <Card step="3" title="Met hoeveel kom je?">
                <div className="flex gap-3">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => setPersons(n)} className={"h-12 w-12 rounded-2xl border-2 font-black transition " + (persons === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n}</button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-brand/50">Zelfde prijs, ook met vrienden — geen extra kosten.</p>

                {/* Invite friends — members by name, or non-members straight by e-mail */}
                {isLoggedIn && persons >= 2 && (
                  <div className="mt-4 rounded-2xl border border-borderc bg-paper p-4">
                    <p className="text-sm font-black text-brand">Nodig vrienden uit ({usedInvites}/{inviteSlots})</p>
                    <p className="mt-0.5 text-xs text-brand/50">Leden: hun bezoek telt mee voor hun stats. Nog geen account? Nodig ze uit via e-mail — ze krijgen een uitnodiging + link om een account te maken.</p>

                    {(invitees.length > 0 || emailInvitees.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {invitees.map((m) => (
                          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-brand">{m.name}<button type="button" onClick={() => setInvitees((s) => s.filter((x) => x.id !== m.id))} className="text-brand/60 hover:text-brand">×</button></span>
                        ))}
                        {emailInvitees.map((e) => (
                          <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">{e}<button type="button" onClick={() => setEmailInvitees((s) => s.filter((x) => x !== e))} className="text-white/60 hover:text-white">×</button></span>
                        ))}
                      </div>
                    )}

                    {usedInvites < inviteSlots && buddies.filter((b) => !invitees.some((i) => i.id === b.id)).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {buddies.filter((b) => !invitees.some((i) => i.id === b.id)).map((b) => (
                          <button key={b.id} type="button" onClick={() => setInvitees((s) => (usedInvites < inviteSlots ? [...s, { id: b.id, name: b.name }] : s))} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand/70 transition hover:bg-accent/15">+ {b.name}</button>
                        ))}
                      </div>
                    )}

                    {usedInvites < inviteSlots && (
                      <div className="relative mt-3">
                        <input
                          value={memberQuery}
                          onChange={async (e) => {
                            const q = e.target.value;
                            setMemberQuery(q);
                            if (q.trim().length >= 2) {
                              const r = await searchMembersAction(q);
                              setMemberResults(r.filter((m) => !invitees.some((i) => i.id === m.id)));
                            } else setMemberResults([]);
                          }}
                          placeholder="Zoek een lid op naam…"
                          className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none focus:border-accent"
                        />
                        {memberResults.length > 0 && (
                          <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-borderc bg-white shadow-lg">
                            {memberResults.map((m) => (
                              <button key={m.id} type="button" onClick={() => { setInvitees((s) => (usedInvites < inviteSlots ? [...s, m] : s)); setMemberQuery(""); setMemberResults([]); }} className="block w-full px-3 py-2 text-left text-sm text-brand transition hover:bg-paper">{m.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {usedInvites < inviteSlots && (
                      <div className="mt-2 flex gap-2">
                        <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmailInvite(); } }} placeholder="Geen account? E-mailadres…" className="min-w-0 flex-1 rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
                        <button type="button" onClick={addEmailInvite} className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">Uitnodigen</button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5 border-t border-borderc pt-4">
                  <p className="mb-2 text-sm font-black text-brand">Hoe lang?</p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4].map((n) => {
                      const ok = selected && canBook(selected.dateStr, selected.hour, n);
                      return (
                        <button key={n} disabled={!ok} onClick={() => setDuration(n)} className={"rounded-2xl border-2 px-4 py-2.5 text-center transition disabled:opacity-30 " + (duration === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                          <span className="block text-sm font-black text-brand">{n} uur</span>
                        </button>
                      );
                    })}
                  </div>
                  {!selected && <p className="mt-2 text-xs text-brand/40">Kies eerst een startmoment hierboven.</p>}
                  {duration > 1 && <p className="mt-2 text-xs text-brand/50">Je boekt de zaal exclusief voor de volledige duur — {duration} uur kost {duration} sessies.</p>}
                  {welcomeAvailable && useWelcome && duration > 1 && (
                    <p className="mt-2 text-xs font-bold text-amber-600">Let op: je gratis eerste sessie geldt enkel voor 1 uur. Bij {duration} uur betaal je de volledige prijs — zet de duur op 1 uur om ze gratis te houden.</p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Summary */}
          <div className="h-fit rounded-3xl bg-brand p-7 text-white lg:sticky lg:top-24">
            <h2 className="text-lg font-black">Jouw boeking</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Sessie" value={service?.name || "—"} />
              {isPT && <Row label="Coach" value={coaches.find((c) => c.id === coachId)?.full_name || "—"} />}
              <Row label="Moment" value={selected ? `${days.find((d) => d.dateStr === selected.dateStr)?.weekday || ""} ${days.find((d) => d.dateStr === selected.dateStr)?.dayMonth || ""} · ${slotRangeLabel(selected.hour, (isFit60 ? duration : 1) * 60)}` : "—"} />
              {isFit60 && <Row label="Personen" value={persons} />}
              {isFit60 && <Row label="Duur" value={`${duration} uur`} />}
            </dl>

            {isFit60 && welcomeAvailable && (
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/10 p-3 text-sm">
                <input type="checkbox" checked={useWelcome} onChange={(e) => setUseWelcome(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#5fda6b]" />
                <span className="text-lav">Gebruik <span className="font-bold text-accent">FittinWelcome</span> — eerste sessie gratis</span>
              </label>
            )}

            {isFit60 && !welcomeApplies && creditBalance >= 1 && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/10 p-3 text-sm">
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#5fda6b]" />
                <span className="text-lav">Betaal met 1 <span className="font-bold text-accent">sessie</span> (saldo: {creditBalance})</span>
              </label>
            )}


            {isLoggedIn && !welcomeApplies && !creditApplies && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-lav">Kortingscode</p>
                <div className="mt-2 flex gap-2">
                  <input value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setDiscountInfo(null); }} placeholder="bv. TERUG50"
                    className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm uppercase text-white placeholder:text-lav/60 outline-none focus:border-accent" />
                  <button type="button" disabled={!discountCode.trim() || applyingCode}
                    onClick={async () => {
                      setApplyingCode(true);
                      setDiscountInfo(null);
                      const r = await validateDiscountAction(discountCode.trim(), priceCents);
                      setApplyingCode(false);
                      setDiscountInfo(r);
                    }}
                    className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-40">
                    {applyingCode ? "…" : "Toepassen"}
                  </button>
                </div>
                {discountInfo?.error && <p className="mt-1.5 text-xs font-semibold text-red-200">{discountInfo.error}</p>}
                {discountInfo?.ok && <p className="mt-1.5 text-xs font-semibold text-accent">✓ {discountInfo.label} — je betaalt {euro(discountInfo.cents)}</p>}
              </div>
            )}

            <div className="mt-6 flex items-baseline justify-between border-t border-white/15 pt-5">
              <span className="text-lav">Totaal</span>
              <span className="text-3xl font-black text-accent">
                {welcomeApplies ? "Gratis" : creditApplies ? "1 sessie" : discountInfo?.ok ? euro(discountInfo.cents) : euro(priceCents)}
              </span>
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-sm font-semibold text-red-100">{error}</p>}

            {isLoggedIn ? (
              <button onClick={submit} disabled={!selected || busy} className="mt-6 w-full rounded-full bg-accent py-3.5 font-bold text-brand transition enabled:hover:opacity-90 disabled:opacity-40">
                {busy ? "Even geduld…" : !selected ? "Kies eerst een moment" : "Bevestig boeking"}
              </button>
            ) : (
              <div className="mt-6 space-y-2">
                {/* Carry the chosen slot through signup/login so it's pre-selected when they land back. */}
                <Link href={`/login?mode=signup&next=${encodeURIComponent(selected ? `/boeken?d=${selected.dateStr}&h=${selected.hour}&p=${persons}&u=${duration}` : "/boeken")}`} className="block w-full rounded-full bg-accent py-3.5 text-center font-bold text-brand transition hover:opacity-90">
                  Maak account & boek je eerste uur gratis
                </Link>
                <p className="text-center text-xs text-lav">
                  Al een account?{" "}
                  <Link href={`/login?next=${encodeURIComponent(selected ? `/boeken?d=${selected.dateStr}&h=${selected.hour}&p=${persons}&u=${duration}` : "/boeken")}`} className="font-bold text-white/80 hover:underline">Inloggen</Link>
                </p>
              </div>
            )}
            <p className="mt-3 text-center text-xs text-lav">Verplaatsen kan tot 6u voor je sessie. Sessies worden altijd betaald.</p>
          </div>
        </div>
        )}
      </div>
    </main>
  );
}

function Card({ step, title, children }) {
  return (
    <div className="rounded-3xl border border-borderc bg-white p-7">
      <h2 className="font-black"><span className="text-accentdark">{step} · </span>{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-lav">{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  );
}
