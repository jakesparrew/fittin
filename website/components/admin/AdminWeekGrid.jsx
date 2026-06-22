"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { slotInstant, fmtHour } from "@/lib/time";
import { adminCreateBooking, adminBlockSlot, adminBlockRange, adminCancelBooking, adminUnblock, adminRescheduleBooking, adminDayAvailability } from "@/app/beheer/actions";
import SearchSelect from "@/components/admin/SearchSelect";

const toast = (type, msg) => { try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {} };
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Week schedule for /beheer/boekingen.
// - Empty cells: click → plan/block modal. Drag across consecutive empty cells in one day → block that range.
// - Booked cells: drag onto a free cell to MOVE the session, or use "verplaats" (modal) / "annuleer".
// - Blocked cells render their own unblock control.
export default function AdminWeekGrid({ days, hours, bookings = [], blocks = [], members = [], services = [], takenSlots = [], coaches = [] }) {
  const router = useRouter();
  const bookMap = new Map(bookings.map((b) => [b.t, b]));
  const blockMap = new Map(blocks.map((b) => [b.t, b]));
  // Every 30-min instant an existing booking covers (a 1h session spans 2 cells). Used to mark the
  // continuation cell of a multi-cell session as "bezet" so it isn't shown as a free drop target.
  const takenSet = new Set(takenSlots.map((s) => new Date(s).getTime()));

  const [drag, setDrag] = useState(null); // { date, from, to } while drag-selecting empty cells to block
  const [planModal, setPlanModal] = useState(null); // { date, hour, label }
  const [rangeModal, setRangeModal] = useState(null); // { date, from, to, label }
  const [moveModal, setMoveModal] = useState(null); // { bk, date } — "verplaats" fallback
  const [dragBk, setDragBk] = useState(null); // booking being dragged (HTML5 DnD)
  const [hoverCell, setHoverCell] = useState(null); // "date:hour" of the cell under the dragged booking

  // Resolve the block-select drag on mouse release: single cell → plan modal, range → block-range modal.
  useEffect(() => {
    function up() {
      setDrag((d) => {
        if (d) {
          const lo = Math.min(d.from, d.to);
          const hi = Math.max(d.from, d.to);
          const day = days.find((x) => x.dateStr === d.date);
          const lbl = day ? `${day.weekday} ${day.dayMonth}` : d.date;
          if (lo === hi) setPlanModal({ date: d.date, hour: lo, label: `${lbl} · ${fmtHour(lo)}` });
          else setRangeModal({ date: d.date, from: lo, to: hi + 0.5, label: `${lbl} · ${fmtHour(lo)} – ${fmtHour(hi + 0.5)}` });
        }
        return null;
      });
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [days]);

  const inDrag = (date, h) => drag && drag.date === date && h >= Math.min(drag.from, drag.to) && h <= Math.max(drag.from, drag.to);

  // Drop a dragged booking onto a free (date, hour) cell → reschedule it there.
  async function moveTo(date, hour) {
    setHoverCell(null);
    const bk = dragBk;
    setDragBk(null);
    if (!bk) return;
    const fd = new FormData();
    fd.set("bookingId", bk.id); fd.set("date", date); fd.set("hour", String(hour));
    const res = await adminRescheduleBooking(fd);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Sessie verplaatst ✓");
    router.refresh();
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-borderc bg-white">
      <p className="px-4 pt-3 text-[11px] font-semibold text-brand/40">Tip: sleep over lege uren om een reeks te blokkeren · klik een uur om te plannen of blokkeren · versleep een sessie naar een vrij uur om ze te verplaatsen.</p>
      <table className="w-full min-w-[760px] text-xs">
        <thead>
          <tr className="border-b border-borderc text-brand/50">
            <th className="w-12 px-2 py-2"></th>
            {days.map((d) => (
              <th key={d.dateStr} className="px-2 py-2 font-bold">
                <div className="uppercase">{d.weekday}</div>
                <div className="text-brand">{d.dayMonth}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="select-none">
          {hours.map((h) => (
            <tr key={h} className="border-b border-borderc/60">
              <td className="px-2 py-1 text-right font-bold text-brand/40">{fmtHour(h)}</td>
              {days.map((d) => {
                const t = slotInstant(d.dateStr, h).getTime();
                const bk = bookMap.get(t);
                const bl = blockMap.get(t);
                const cont = !bk && !bl && takenSet.has(t); // 2nd half of a multi-cell session
                const cellKey = `${d.dateStr}:${h}`;
                const reserved = bk && bk.reserved;
                return (
                  <td key={d.dateStr} className="h-12 border-l border-borderc/60 p-1 align-top">
                    {bk ? (
                      <div
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", bk.id); } catch {} setDragBk(bk); }}
                        onDragEnd={() => { setDragBk(null); setHoverCell(null); }}
                        title="Versleep naar een vrij uur om te verplaatsen"
                        className={"flex h-full cursor-move flex-col justify-center rounded-lg px-1.5 py-1 leading-tight transition hover:ring-2 hover:ring-accent " + (reserved ? "bg-brand/10" : "bg-accent/20") + (dragBk?.id === bk.id ? " opacity-40" : "")}
                      >
                        <span className="truncate font-bold text-brand">{reserved ? "Gereserveerd" : (bk.name || "Lid")}</span>
                        <span className="truncate text-[10px] text-brand/50">{bk.serviceName} · {bk.persons}p</span>
                        <div className="flex items-center gap-2 leading-none">
                          <button type="button" onClick={() => setMoveModal({ bk, date: d.dateStr })} className="text-[10px] font-bold text-accentdark hover:underline">verplaats</button>
                          <form action={adminCancelBooking} className="leading-none">
                            <input type="hidden" name="bookingId" value={bk.id} />
                            <button className="text-[10px] font-bold text-red-500 hover:underline">annuleer</button>
                          </form>
                        </div>
                      </div>
                    ) : bl ? (
                      <div className="flex h-full flex-col justify-center rounded-lg bg-brand/10 px-1.5 py-1 leading-tight">
                        <span className="truncate font-bold text-brand/60">Geblokkeerd</span>
                        {bl.reason && <span className="truncate text-[10px] text-brand/40">{bl.reason}</span>}
                        <form action={adminUnblock} className="leading-none">
                          <input type="hidden" name="blockId" value={bl.id} />
                          <button className="text-[10px] font-bold text-accentdark hover:underline">deblokkeer</button>
                        </form>
                      </div>
                    ) : cont ? (
                      // Continuation of a multi-cell session (e.g. the 18:30 half of an 18:00–19:00 booking).
                      // Occupied → not a drop target, no "+".
                      <div className="h-full min-h-7 rounded bg-accent/10" aria-hidden />
                    ) : (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); setDrag({ date: d.dateStr, from: h, to: h }); }}
                        onMouseEnter={() => setDrag((cur) => (cur && cur.date === d.dateStr ? { ...cur, to: h } : cur))}
                        onDragOver={(e) => { if (dragBk) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setHoverCell(cellKey); } }}
                        onDragLeave={() => setHoverCell((c) => (c === cellKey ? null : c))}
                        onDrop={(e) => { e.preventDefault(); moveTo(d.dateStr, h); }}
                        className={"flex h-full min-h-7 w-full items-center justify-center rounded text-brand/20 transition " + (hoverCell === cellKey && dragBk ? "bg-accent/40 text-brand ring-2 ring-accent" : inDrag(d.dateStr, h) ? "bg-brand/20 text-brand" : "hover:bg-accent/10 hover:text-accentdark")}
                        aria-label="Plan, blokkeer of laat een sessie hier vallen"
                      >
                        {hoverCell === cellKey && dragBk ? "↓" : "+"}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {planModal && (
        <PlanModal modal={planModal} members={members} services={services} coaches={coaches} onClose={() => setPlanModal(null)} onDone={() => { setPlanModal(null); router.refresh(); }} />
      )}
      {rangeModal && (
        <RangeBlockModal modal={rangeModal} onClose={() => setRangeModal(null)} onDone={() => { setRangeModal(null); router.refresh(); }} />
      )}
      {moveModal && (
        <RescheduleModal modal={moveModal} onClose={() => setMoveModal(null)} onDone={() => { setMoveModal(null); router.refresh(); }} />
      )}
    </div>
  );
}

function PlanModal({ modal, members, services, coaches = [], onClose, onDone }) {
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const res = await adminCreateBooking(fd);
    return res?.error ? { error: res.error } : { ok: true };
  }, null);
  const [blockState, blockAction, blocking] = useActionState(async (_p, fd) => {
    const res = await adminBlockSlot(fd);
    return res?.error ? { error: res.error } : { ok: true };
  }, null);
  useEffect(() => { if (state?.ok || blockState?.ok) onDone(); }, [state, blockState]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4 text-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-black text-brand">Sessie inplannen</h3>
            <p className="mt-0.5 capitalize text-brand/60">{modal.label}</p>
          </div>
          <button onClick={onClose} className="text-brand/40 hover:text-brand">✕</button>
        </div>
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="date" value={modal.date} />
          <input type="hidden" name="hour" value={modal.hour} />
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Lid</span>
            <SearchSelect name="memberId" required placeholder="Zoek een lid…" options={members.map((m) => ({ value: m.id, label: m.label }))} />
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Coach (optioneel)</span>
            <SearchSelect name="coachId" placeholder="Geen coach" options={coaches.map((c) => ({ value: c.id, label: c.label }))} />
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Sessie</span>
            <select name="serviceId" required className="w-full rounded-lg border-2 border-borderc px-3 py-2">
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Pers</span>
              <input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-20 rounded-lg border-2 border-borderc px-3 py-2" />
            </label>
            <label className="mt-4 flex items-center gap-2 text-xs font-bold text-brand/70">
              <input type="checkbox" name="useCredit" className="h-4 w-4 accent-[#5fda6b]" />
              Trek 1 sessie af
            </label>
          </div>
          {state?.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-full bg-accent px-5 py-2.5 font-black text-brand transition hover:opacity-90 disabled:opacity-50">
            {pending ? "Bezig…" : "+ Boeken"}
          </button>
        </form>

        <form action={blockAction} className="mt-4 border-t border-borderc pt-4">
          <input type="hidden" name="date" value={modal.date} />
          <input type="hidden" name="hour" value={modal.hour} />
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Of blokkeer dit uur</span>
              <input name="reason" placeholder="reden (optioneel, bv. onderhoud)" className="w-full rounded-lg border-2 border-borderc px-3 py-2" />
            </label>
            <button disabled={blocking} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{blocking ? "…" : "Blokkeer"}</button>
          </div>
          {blockState?.error && <p className="mt-2 text-sm font-semibold text-red-600">{blockState.error}</p>}
        </form>
      </div>
    </div>
  );
}

function RangeBlockModal({ modal, onClose, onDone }) {
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const res = await adminBlockRange(fd);
    return res?.error ? { error: res.error } : { ok: true };
  }, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4 text-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-black text-brand">Reeks blokkeren</h3>
            <p className="mt-0.5 capitalize text-brand/60">{modal.label}</p>
          </div>
          <button onClick={onClose} className="text-brand/40 hover:text-brand">✕</button>
        </div>
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="date" value={modal.date} />
          <input type="hidden" name="from_hour" value={modal.from} />
          <input type="hidden" name="to_hour" value={modal.to} />
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Reden</span>
            <input name="reason" placeholder="bv. onderhoud, evenement, vakantie" className="w-full rounded-lg border-2 border-borderc px-3 py-2" />
          </label>
          {state?.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-full bg-brand px-5 py-2.5 font-black text-white transition hover:opacity-90 disabled:opacity-50">
            {pending ? "Bezig…" : `Blokkeer ${modal.to - modal.from} uur`.replace(".5", "½")}
          </button>
        </form>
      </div>
    </div>
  );
}

// Click-fallback for moving a session (works without drag-and-drop). Availability-aware hour dropdown.
function RescheduleModal({ modal, onClose, onDone }) {
  const [date, setDate] = useState(modal.date || todayStr());
  const [hours, setHours] = useState(null);
  const [hour, setHour] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadHours(d) {
    setHours(null); setHour("");
    const r = await adminDayAvailability(d);
    setHours(r?.hours || []);
  }
  useEffect(() => { loadHours(modal.date || todayStr()); }, []); // eslint-disable-line

  async function submit() {
    if (!date || hour === "") { toast("error", "Kies een dag en vrij uur."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("bookingId", modal.bk.id); fd.set("date", date); fd.set("hour", String(hour));
    const res = await adminRescheduleBooking(fd);
    setBusy(false);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Sessie verplaatst ✓");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4 text-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-black text-brand">Sessie verplaatsen</h3>
            <p className="mt-0.5 text-brand/60">{modal.bk.reserved ? "Gereserveerd" : (modal.bk.name || "Lid")} · {modal.bk.serviceName}</p>
          </div>
          <button onClick={onClose} className="text-brand/40 hover:text-brand">✕</button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Nieuwe datum</span>
            <input type="date" min={todayStr()} value={date} onChange={(e) => { setDate(e.target.value); loadHours(e.target.value); }} className="w-full rounded-lg border-2 border-borderc px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Nieuw uur (enkel vrije uren)</span>
            <select value={hour} onChange={(e) => setHour(e.target.value)} className="w-full rounded-lg border-2 border-borderc px-3 py-2">
              <option value="">{hours === null ? "Laden…" : hours.length ? "Kies een vrij uur…" : "Geen vrij uur die dag"}</option>
              {(hours || []).map((hh) => <option key={hh} value={hh}>{fmtHour(hh)}</option>)}
            </select>
          </label>
          <button onClick={submit} disabled={busy} className="w-full rounded-full bg-accent px-5 py-2.5 font-black text-brand transition hover:opacity-90 disabled:opacity-50">
            {busy ? "Bezig…" : "Verplaats sessie"}
          </button>
        </div>
      </div>
    </div>
  );
}
