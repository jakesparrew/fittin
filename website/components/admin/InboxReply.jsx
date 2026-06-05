"use client";
import { useActionState } from "react";
import { replyInboxAction } from "@/app/beheer/inbox-actions";

export default function InboxReply({ id, fromEmail, toName }) {
  const [state, action, pending] = useActionState(async (_p, fd) => replyInboxAction(fd), null);
  if (state?.ok) return <p className="rounded-xl bg-accent/10 p-4 text-sm font-semibold text-accentdark">Antwoord verstuurd naar {toName} ✓</p>;
  return (
    <form action={action} className="rounded-2xl border border-borderc bg-white p-5">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm font-bold text-brand">Antwoord <span className="text-brand/50">— vanaf {fromEmail}</span></p>
      <textarea name="body" rows={6} required placeholder={`Schrijf je antwoord aan ${toName}…`} className="mt-3 w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm outline-none focus:border-accent" />
      <div className="mt-3 flex items-center gap-3">
        <button disabled={pending} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{pending ? "Verzenden…" : "Verstuur antwoord"}</button>
        {state?.error && <span className="text-sm font-semibold text-red-500">{state.error}</span>}
      </div>
    </form>
  );
}
