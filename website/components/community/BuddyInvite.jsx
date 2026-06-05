"use client";
import { useActionState } from "react";
import { inviteBuddy } from "@/app/(site)/community/buddy-actions";

export default function BuddyInvite() {
  const [state, action, pending] = useActionState(async (_p, fd) => inviteBuddy(fd), null);
  return (
    <form action={action} className="mt-4">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="E-mail van je buddy" className="flex-1 rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        <button disabled={pending} className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand disabled:opacity-60">{pending ? "…" : "Uitnodigen"}</button>
      </div>
      {state?.error && <p className="mt-2 text-sm font-semibold text-red-500">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm font-semibold text-accentdark">{state.message}</p>}
    </form>
  );
}
