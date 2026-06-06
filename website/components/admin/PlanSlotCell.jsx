"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateBooking, adminBlockSlot } from "@/app/beheer/actions";
import SearchSelect from "@/components/admin/SearchSelect";

// An empty calendar cell on /beheer/boekingen. Click → modal to plan a session (member + service)
// OR block the slot (no member/service needed).
export default function PlanSlotCell({ date, hour, label, members = [], services = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const res = await adminCreateBooking(fd);
    if (res?.error) return { error: res.error };
    return { ok: true };
  }, null);
  const [blockState, blockAction, blocking] = useActionState(async (_p, fd) => {
    const res = await adminBlockSlot(fd);
    if (res?.error) return { error: res.error };
    return { ok: true };
  }, null);

  useEffect(() => {
    if (state?.ok || blockState?.ok) { setOpen(false); router.refresh(); }
  }, [state, blockState, router]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-full min-h-7 w-full items-center justify-center rounded text-brand/20 transition hover:bg-accent/10 hover:text-accentdark" aria-label="Plan sessie">
        +
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 p-4 text-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-brand">Sessie inplannen</h3>
                <p className="mt-0.5 capitalize text-brand/60">{label}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-brand/40 hover:text-brand">✕</button>
            </div>
            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="hour" value={hour} />
              <div>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Lid</span>
                <SearchSelect name="memberId" required placeholder="Zoek een lid…" options={members.map((m) => ({ value: m.id, label: m.label }))} />
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

            {/* Or just block this slot (no member/service) */}
            <form action={blockAction} className="mt-4 border-t border-borderc pt-4">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="hour" value={hour} />
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
      )}
    </>
  );
}
