"use client";
import { useActionState } from "react";
import { inviteFriendByEmail } from "@/app/(site)/community/buddy-actions";

export default function ReferralInvite() {
  const [state, action, pending] = useActionState(inviteFriendByEmail, null);
  if (state?.ok) return <p className="mt-3 text-sm font-semibold text-accentdark">{state.message}</p>;
  return (
    <form action={action} className="mt-3">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="E-mail van je vriend" className="flex-1 rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        <button disabled={pending} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "…" : "Uitnodigen"}</button>
      </div>
      {state?.error && <p className="mt-2 text-sm font-semibold text-red-500">{state.error}</p>}
    </form>
  );
}
