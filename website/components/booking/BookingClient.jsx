"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBookingAction } from "@/app/(site)/boeken/actions";
import { slotInstant, brusselsDateStr, slotRangeLabel } from "@/lib/time";

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
  paymentCanceled = false,
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(
    (services.find((s) => s.type === "fit60") || services[0])?.id
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(null); // { dateStr, hour }
  const [persons, setPersons] = useState(1);
  const [coachId, setCoachId] = useState(coaches[0]?.id || "");
  const [useWelcome, setUseWelcome] = useState(welcomeAvailable);
  const [useCredit, setUseCredit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);

  const service = services.find((s) => s.id === serviceId) || services[0];
  const isFit60 = service?.type === "fit60";
  const isPT = service?.type === "pt";

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

  const hours = useMemo(() => {
    const list = [];
    for (let h = gym.open_hour; h < gym.close_hour; h++) list.push(h);
    return list;
  }, [gym.open_hour, gym.close_hour]);

  function coachOpen(dateStr, h) {
    if (!isPT || !coachId) return true;
    const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return availability.some((a) => a.coach_id === coachId && a.weekday === wd && a.from_hour <= h && h < a.to_hour);
  }

  const welcomeApplies = isFit60 && welcomeAvailable && useWelcome;
  const creditApplies = isFit60 && !welcomeApplies && useCredit && creditBalance >= 1;
  const priceCents = welcomeApplies || creditApplies ? 0 : service?.price_cents ?? 0;

  async function submit() {
    if (!selected || !service) return;
    setBusy(true);
    setError("");
    const res = await createBookingAction({
      serviceId: service.id,
      date: selected.dateStr,
      hour: selected.hour,
      persons: isFit60 ? persons : 1,
      useWelcome: welcomeApplies,
      coachId: isPT ? coachId : null,
      useCredit: creditApplies,
    });
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
      range: slotRangeLabel(selected.hour, service.duration_min),
      persons: isFit60 ? persons : 1,
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
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Online boeken</p>
        <h1 className="mt-3 text-3xl font-black md:text-4xl">Reserveer je sessie</h1>
        {welcomeAvailable ? (
          <p className="mt-3 max-w-xl text-brand/70">
            Welkom! Je eerste Fit60-sessie is <span className="font-bold text-accentdark">gratis</span> met{" "}
            <span className="rounded-full bg-brand px-3 py-0.5 font-bold text-accent">FittinWelcome</span>.
          </p>
        ) : (
          <p className="mt-3 max-w-xl text-brand/70">De zaal is 24/7 van jou tijdens je boeking — kies je moment.</p>
        )}
        {paymentCanceled && (
          <p className="mt-4 rounded-2xl bg-accent/10 p-4 text-sm font-semibold text-accentdark">
            Betaling geannuleerd. Kies gerust opnieuw een moment.
          </p>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
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
                    <p className="mt-1 text-sm text-brand/60">{s.duration_min} min · {s.type === "fit60" ? euro(s.price_cents) : "vanaf " + euro(s.price_cents)}</p>
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

              <div className="overflow-x-auto">
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
                  <div className="max-h-[420px] overflow-y-auto pr-1">
                    {hours.map((h) => (
                      <div key={h} className="grid grid-cols-[44px_repeat(7,1fr)] gap-1 py-0.5">
                        <div className="flex items-center justify-end pr-1 text-[10px] font-bold text-brand/30">{String(h).padStart(2, "0")}:00</div>
                        {days.map((d) => {
                          const t = slotInstant(d.dateStr, h).getTime();
                          const taken = takenSet.has(t);
                          const past = t < Date.now();
                          const closed = !coachOpen(d.dateStr, h);
                          const isSel = selected && selected.dateStr === d.dateStr && selected.hour === h;
                          if (past || closed) return <div key={d.dateStr} className="h-7 rounded-md bg-paper" />;
                          if (taken) return <div key={d.dateStr} className="flex h-7 items-center justify-center rounded-md bg-borderc/40 text-[9px] font-bold text-brand/30">vol</div>;
                          return (
                            <button
                              key={d.dateStr}
                              onClick={() => setSelected({ dateStr: d.dateStr, hour: h })}
                              className={"h-7 rounded-md border text-[9px] font-bold transition " + (isSel ? "border-accent bg-accent text-brand" : "border-accent/30 bg-accent/10 text-accentdark hover:bg-accent/25")}
                            >
                              {isSel ? "✓" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-brand/40">Groen = vrij · grijs = geboekt · de zaal is exclusief van jou tijdens je sessie.</p>
            </Card>

            {/* Persons */}
            {isFit60 && (
              <Card step="3" title="Met hoeveel kom je?">
                <div className="flex gap-3">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => setPersons(n)} className={"h-12 w-12 rounded-2xl border-2 font-black transition " + (persons === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n}</button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-brand/50">Zelfde prijs, ook met vrienden — geen extra kosten.</p>
              </Card>
            )}
          </div>

          {/* Summary */}
          <div className="h-fit rounded-3xl bg-brand p-7 text-white lg:sticky lg:top-24">
            <h2 className="text-lg font-black">Jouw boeking</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Sessie" value={service?.name || "—"} />
              {isPT && <Row label="Coach" value={coaches.find((c) => c.id === coachId)?.full_name || "—"} />}
              <Row label="Moment" value={selected ? `${days.find((d) => d.dateStr === selected.dateStr)?.weekday || ""} ${days.find((d) => d.dateStr === selected.dateStr)?.dayMonth || ""} · ${slotRangeLabel(selected.hour, service.duration_min)}` : "—"} />
              {isFit60 && <Row label="Personen" value={persons} />}
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
                <span className="text-lav">Betaal met 1 <span className="font-bold text-accent">credit</span> (saldo: {creditBalance})</span>
              </label>
            )}

            <div className="mt-6 flex items-baseline justify-between border-t border-white/15 pt-5">
              <span className="text-lav">Totaal</span>
              <span className="text-3xl font-black text-accent">
                {welcomeApplies ? "Gratis" : creditApplies ? "1 credit" : euro(priceCents)}
              </span>
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-sm font-semibold text-red-100">{error}</p>}

            {isLoggedIn ? (
              <button onClick={submit} disabled={!selected || busy} className="mt-6 w-full rounded-full bg-accent py-3.5 font-bold text-brand transition enabled:hover:opacity-90 disabled:opacity-40">
                {busy ? "Even geduld…" : !selected ? "Kies eerst een moment" : "Bevestig boeking"}
              </button>
            ) : (
              <Link href="/login?next=/boeken" className="mt-6 block w-full rounded-full bg-accent py-3.5 text-center font-bold text-brand transition hover:opacity-90">Log in om te boeken</Link>
            )}
            <p className="mt-3 text-center text-xs text-lav">Kosteloos annuleren tot 24u vooraf.</p>
          </div>
        </div>
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
