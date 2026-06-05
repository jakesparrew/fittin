"use client";
import { useActionState, useState } from "react";
import { inviteBuddy, requestBuddyById } from "@/app/(site)/community/buddy-actions";
import { searchMembersAction } from "@/app/(site)/boeken/actions";

export default function BuddyInvite() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [emailState, emailAction, emailPending] = useActionState(async (_p, fd) => inviteBuddy(fd), null);

  async function search(v) {
    setQ(v);
    if (v.trim().length >= 2) setResults(await searchMembersAction(v));
    else setResults([]);
  }
  async function pick(m) {
    setResults([]);
    setQ("");
    const r = await requestBuddyById(m.id);
    setPicked(r);
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-lav">Zoek een lid</p>
      <div className="relative">
        <input value={q} onChange={(e) => search(e.target.value)} placeholder="Typ een naam…" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm outline-none focus:border-accent" />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-borderc bg-white shadow-lg">
            {results.map((m) => (
              <button key={m.id} type="button" onClick={() => pick(m)} className="block w-full px-3 py-2 text-left text-sm text-brand transition hover:bg-paper">{m.name}</button>
            ))}
          </div>
        )}
      </div>
      {picked?.error && <p className="text-sm font-semibold text-red-500">{picked.error}</p>}
      {picked?.ok && <p className="text-sm font-semibold text-accentdark">{picked.message}</p>}

      <details className="pt-1 text-sm">
        <summary className="cursor-pointer text-brand/50">Vriend nog geen lid? Nodig uit via e-mail</summary>
        <form action={emailAction} className="mt-2 flex gap-2">
          <input name="email" type="email" required placeholder="E-mail van je vriend" className="flex-1 rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
          <button disabled={emailPending} className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand disabled:opacity-60">{emailPending ? "…" : "Uitnodigen"}</button>
        </form>
        {emailState?.error && <p className="mt-2 text-sm font-semibold text-red-500">{emailState.error}</p>}
        {emailState?.ok && <p className="mt-2 text-sm font-semibold text-accentdark">{emailState.message}</p>}
      </details>
    </div>
  );
}
