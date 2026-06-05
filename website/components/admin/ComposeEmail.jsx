"use client";
import { useActionState, useState } from "react";
import { sendNewEmail } from "@/app/beheer/inbox-actions";

const FROMS = [
  { v: "info@fittin.be", l: "info@fittin.be (algemeen)" },
  { v: "boekingen@booking.fittin.be", l: "boekingen@booking.fittin.be" },
  { v: "nieuwsbrief@news.fittin.be", l: "nieuwsbrief@news.fittin.be" },
];

export default function ComposeEmail() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const r = await sendNewEmail(fd);
    if (r?.ok) setTimeout(() => setOpen(false), 1200);
    return r;
  }, null);

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition hover:opacity-90">+ Nieuwe e-mail</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-brand/40 p-4 pt-16" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-black text-brand">Nieuwe e-mail</h2>
              <button onClick={() => setOpen(false)} className="text-brand/40 hover:text-brand">✕</button>
            </div>
            <form action={action} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Van</span>
                <select name="from" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm">
                  {FROMS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Aan</span>
                <input name="to" type="email" required placeholder="ontvanger@email.be" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Onderwerp</span>
                <input name="subject" required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Bericht</span>
                <textarea name="body" rows={7} required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
              <div className="flex items-center gap-3">
                <button disabled={pending} className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand disabled:opacity-60">{pending ? "Verzenden…" : "Verstuur"}</button>
                {state?.error && <span className="text-sm font-semibold text-red-500">{state.error}</span>}
                {state?.ok && <span className="text-sm font-semibold text-accentdark">Verzonden ✓</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
