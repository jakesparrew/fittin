"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { coachBookSession } from "@/app/coach/actions";
import { fmtHour, slotInstant } from "@/lib/time";
import { beurtTekst, kostVanBoeking, FEE_STANDAARD_CENTS } from "@/lib/aanbreng";

// Interactive week schedule for coaches: see gym-wide taken slots + your own planned sessions,
// click a free slot → modal to pick a client/service → books via coachBookSession.
//
// `aanbrengIds` = clienten die Fittin' doorgaf: met hen kost een boeking een halve beurt extra.
// `clientVerplicht` = deze coach moet bij elke boeking zeggen wie er traint (0152). Beide leeg/uit
// als default, zodat de planner ook werkt voor een coach zonder aanbreng.
export default function CoachScheduler({ days, hours, taken = [], mine = {}, members = [], services = [], aanbrengIds = [], clientVerplicht = false }) {
  const router = useRouter();
  const [offset, setOffset] = useState(0); // 0 = this week, 7 = next week
  const [slot, setSlot] = useState(null); // { dateStr, hour, label }
  const [mobileDay, setMobileDay] = useState(null); // selected day on the phone layout
  // Staat van het modalformulier. Nodig omdat de kost VÓÓR het boeken zichtbaar moet zijn en omdat
  // het naamveld pas verplicht is zolang er geen client gekozen is.
  const [clientId, setClientId] = useState("");
  const [naam, setNaam] = useState("");
  const [uren, setUren] = useState(1);
  const aanbrengSet = new Set(aanbrengIds);
  const takenSet = new Set(taken);
  const week = days.slice(offset, offset + 7);
  const activeDay = week.find((d) => d.dateStr === mobileDay) ? mobileDay : week[0]?.dateStr;
  const activeDayObj = week.find((d) => d.dateStr === activeDay);

  const [state, action, pending] = useActionState(async (_prev, formData) => {
    const res = await coachBookSession(formData);
    if (res?.error) return { error: res.error };
    return { ok: true };
  }, null);

  useEffect(() => {
    if (state?.ok) { setSlot(null); router.refresh(); }
  }, [state, router]);

  // Sluit de modal, dan begint het volgende uur met een leeg formulier — anders sleept de vorige
  // client mee naar een sessie waar hij niet bij hoort.
  useEffect(() => {
    if (!slot) { setClientId(""); setNaam(""); setUren(1); }
  }, [slot]);

  const hourLabel = fmtHour;

  return (
    <section className="rounded-3xl border border-borderc bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-black text-brand">Planning</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(0)} className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (offset === 0 ? "bg-brand text-white" : "bg-paper text-brand/60")}>Deze week</button>
          <button onClick={() => setOffset(7)} className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (offset === 7 ? "bg-brand text-white" : "bg-paper text-brand/60")}>Volgende week</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-brand/50">Klik op een vrij uur om een sessie in te plannen — {clientVerplicht ? "met je client, of met de naam van je externe client." : "met een client, of reserveer het uur alvast voor jezelf."}</p>

      {/* Desktop: full week grid */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <div className="min-w-[640px]">
          {/* Day header */}
          <div className="grid" style={{ gridTemplateColumns: `48px repeat(${week.length}, 1fr)` }}>
            <div />
            {week.map((d) => (
              <div key={d.dateStr} className="px-1 pb-2 text-center">
                <p className="text-xs font-black capitalize text-brand">{d.weekday}</p>
                <p className="text-[10px] text-brand/50">{d.dayMonth}</p>
              </div>
            ))}
          </div>
          {/* Rows per hour */}
          {hours.map((h) => (
            <div key={h} className="grid items-stretch border-t border-borderc/60" style={{ gridTemplateColumns: `48px repeat(${week.length}, 1fr)` }}>
              <div className="py-1 pr-1 text-right text-[10px] font-bold text-brand/40">{hourLabel(h)}</div>
              {week.map((d) => {
                const key = `${d.dateStr}:${h}`;
                const own = mine[key];
                const isTaken = takenSet.has(key);
                const past = slotInstant(d.dateStr, h).getTime() < Date.now();
                if (own) {
                  return <div key={key} className="m-0.5 rounded-md bg-accent/25 px-1 py-1 text-center text-[10px] font-bold leading-tight text-accentdark" title={`${own.name} · ${own.service}`}>{own.name?.split(" ")[0] || "Client"}</div>;
                }
                if (isTaken || past) {
                  return <div key={key} className="m-0.5 rounded-md bg-paper px-1 py-1 text-center text-[10px] text-brand/30">{past && !isTaken ? "" : "bezet"}</div>;
                }
                return (
                  <button key={key} onClick={() => setSlot({ dateStr: d.dateStr, hour: h, label: `${d.weekday} ${d.dayMonth} · ${hourLabel(h)}` })}
                    className="m-0.5 rounded-md border border-dashed border-borderc py-1 text-center text-[11px] font-bold text-brand/40 transition hover:border-accent hover:bg-accent/10 hover:text-accentdark">
                    +
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: pick a day, then tap a free hour — no horizontal scrolling */}
      <div className="mt-4 md:hidden">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {week.map((d) => {
            const act = activeDay === d.dateStr;
            return (
              <button key={d.dateStr} onClick={() => setMobileDay(d.dateStr)} className={"flex-1 shrink-0 rounded-xl border-2 px-2 py-1.5 text-center transition " + (act ? "border-accent bg-accent/15" : "border-borderc")}>
                <span className="block text-[9px] font-bold uppercase text-brand/40">{d.weekday}</span>
                <span className="block text-xs font-black text-brand">{d.dayMonth.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {hours.map((h) => {
            const key = `${activeDay}:${h}`;
            const own = mine[key];
            const isTaken = takenSet.has(key);
            const past = slotInstant(activeDay, h).getTime() < Date.now();
            if (own) return <div key={h} className="rounded-xl bg-accent/25 py-2 text-center text-[10px] font-bold leading-tight text-accentdark">{hourLabel(h)}<br />{own.name?.split(" ")[0] || "Client"}</div>;
            if (isTaken) return <div key={h} className="rounded-xl bg-paper py-2 text-center text-[10px] leading-tight text-brand/30">{hourLabel(h)}<br />bezet</div>;
            if (past) return <div key={h} className="rounded-xl bg-paper/60 py-2 text-center text-[10px] text-brand/25">{hourLabel(h)}</div>;
            return (
              <button key={h} onClick={() => setSlot({ dateStr: activeDay, hour: h, label: `${activeDayObj?.weekday} ${activeDayObj?.dayMonth} · ${hourLabel(h)}` })}
                className="rounded-xl border-2 border-dashed border-borderc py-2 text-center text-xs font-bold text-brand/50 transition hover:border-accent hover:bg-accent/10 hover:text-accentdark">
                {hourLabel(h)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Booking modal */}
      {slot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4" onClick={() => setSlot(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-brand">Sessie inplannen</h3>
                <p className="mt-0.5 text-sm capitalize text-brand/60">{slot.label}</p>
              </div>
              <button onClick={() => setSlot(null)} className="text-brand/40 hover:text-brand">✕</button>
            </div>
            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="date" value={slot.dateStr} />
              <input type="hidden" name="hour" value={slot.hour} />
              {/* Zelfde regels als het hoofdformulier: een externe client (niet op platform) kan bij
                  naam genoemd worden, en de client blijft optioneel — behalve bij een coach die van
                  de gym altijd moet zeggen wie er traint. */}
              <Lbl t={clientVerplicht ? "Client" : "Client (optioneel)"}>
                <select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm">
                  {/* Moet deze coach zeggen wie er traint, dan kan "nog geen client" enkel nog met
                      een externe naam erbij — precies wat de databank straks afdwingt. */}
                  <option value="" disabled={clientVerplicht && !naam.trim()}>Nog geen client — reserveer het uur</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
              </Lbl>
              {/* De planner kent wél de aangebrachte clienten, niet het bedrag per doorgave — vandaar
                  het standaardtarief. Het exacte bedrag staat in het tegoedboek en op het dashboard. */}
              {aanbrengSet.has(clientId) && (
                <p className="-mt-1 text-xs font-bold text-accentdark">kost {beurtTekst(kostVanBoeking(uren, FEE_STANDAARD_CENTS))} beurt · klant via Fittin&rsquo;</p>
              )}
              <Lbl t="Of naam (niet op platform)">
                <input name="clientName" value={naam} onChange={(e) => setNaam(e.target.value)} required={clientVerplicht && !clientId} placeholder="bv. Sarah" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </Lbl>
              {clientVerplicht && !clientId && (
                <p className="-mt-1 text-xs text-brand/50">Bij jou is dit verplicht: kies een client, of vul de naam van je externe client in.</p>
              )}
              {services.length === 1 ? (
                <input type="hidden" name="serviceId" value={services[0].id} />
              ) : (
                <Lbl t="Sessie">
                  <select name="serviceId" required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm">
                    {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Lbl>
              )}
              <div className="flex gap-3">
                <Lbl t="Duur">
                  <select name="hours" value={uren} onChange={(e) => setUren(parseFloat(e.target.value))} className="rounded-lg border-2 border-borderc px-3 py-2 text-sm">
                    <option value="1">1 uur</option>
                    <option value="1.5">1u30</option>
                    <option value="2">2 uur</option>
                  </select>
                </Lbl>
                <Lbl t="Personen">
                  <input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-20 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
                </Lbl>
              </div>
              {state?.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
              <button disabled={pending} className="w-full rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">
                {pending ? "Bezig…" : "Boek sessie"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
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
