"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { coachBookSession } from "@/app/coach/actions";

// Interactive week schedule for coaches: see gym-wide taken slots + your own planned sessions,
// click a free slot → modal to pick a client/service → books via coachBookSession.
export default function CoachScheduler({ days, hours, taken = [], mine = {}, members = [], services = [] }) {
  const router = useRouter();
  const [offset, setOffset] = useState(0); // 0 = this week, 7 = next week
  const [slot, setSlot] = useState(null); // { dateStr, hour, label }
  const takenSet = new Set(taken);
  const week = days.slice(offset, offset + 7);

  const [state, action, pending] = useActionState(async (_prev, formData) => {
    const res = await coachBookSession(formData);
    if (res?.error) return { error: res.error };
    return { ok: true };
  }, null);

  useEffect(() => {
    if (state?.ok) { setSlot(null); router.refresh(); }
  }, [state, router]);

  const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

  return (
    <section className="rounded-3xl border border-borderc bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-black text-brand">Planning</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset(0)} className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (offset === 0 ? "bg-brand text-white" : "bg-paper text-brand/60")}>Deze week</button>
          <button onClick={() => setOffset(7)} className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (offset === 7 ? "bg-brand text-white" : "bg-paper text-brand/60")}>Volgende week</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-brand/50">Klik op een vrij uur om een sessie met een client in te plannen.</p>

      <div className="mt-4 overflow-x-auto">
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
                const past = new Date(`${d.dateStr}T${String(h).padStart(2, "0")}:00:00`) < new Date();
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
              <Lbl t="Client">
                <select name="clientId" required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm">
                  <option value="">Kies een lid…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
              </Lbl>
              <Lbl t="Sessie">
                <select name="serviceId" required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm">
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Lbl>
              <Lbl t="Personen">
                <input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-20 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </Lbl>
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
