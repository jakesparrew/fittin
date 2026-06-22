"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { coachCreateClient } from "@/app/coach/actions";

const toast = (type, msg) => { try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {} };

// Lets a coach create a brand-new client by name + e-mail (or link an existing member in the gym)
// straight from the booking screen. On success the member list refreshes so they're selectable.
export default function AddClientInline() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const r = await coachCreateClient(fd);
    return r?.error ? { error: r.error } : { ok: true };
  }, null);

  useEffect(() => {
    if (state?.ok) { toast("success", "Client toegevoegd ✓ — kies hem nu in de lijst."); setOpen(false); router.refresh(); }
    else if (state?.error) { toast("error", state.error); }
  }, [state, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-bold text-accentdark hover:underline">
        + Nieuwe client aanmaken (via e-mail)
      </button>
    );
  }
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-borderc bg-paper p-3">
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Naam</span>
        <input name="full_name" placeholder="Voornaam Naam" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">E-mail</span>
        <input name="email" type="email" required placeholder="client@voorbeeld.be" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
      </label>
      <button disabled={pending} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Bezig…" : "Aanmaken & toewijzen"}</button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-sm font-bold text-brand/40 hover:text-brand">✕</button>
    </form>
  );
}
