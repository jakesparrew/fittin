"use client";
import { useActionState } from "react";
import { subscribeAction } from "@/app/(site)/newsletter-actions";

export default function NewsletterSignup() {
  const [state, action, pending] = useActionState(subscribeAction, null);
  if (state?.ok) {
    return <p className="text-sm font-semibold text-accent">Je bent ingeschreven — welkom bij Fittin&rsquo;! 🎉</p>;
  }
  return (
    <div>
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder="jouw@email.be"
          className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-lav/70 outline-none focus:border-accent"
        />
        <button disabled={pending} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-60">
          {pending ? "Bezig…" : "Inschrijven"}
        </button>
        {state?.error && <p className="text-sm font-semibold text-red-300 sm:basis-full">{state.error}</p>}
      </form>
      <p className="mt-2 text-xs text-lav/70">
        Door in te schrijven ga je akkoord met ons{" "}
        <a href="/privacy" className="underline hover:text-white">privacybeleid</a>. Uitschrijven kan altijd.
      </p>
    </div>
  );
}
