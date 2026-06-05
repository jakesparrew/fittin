"use client";
import { useActionState } from "react";
import { sendNewsletter } from "@/app/beheer/newsletter-actions";

// Send a newsletter with a confirm + inline result.
export function SendNewsletterButton({ id, count }) {
  const [state, action, pending] = useActionState(async (_p, fd) => sendNewsletter(fd), null);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`Nieuwsbrief nu verzenden naar ${count} abonnees?`)) e.preventDefault(); }}
      className="mt-4"
    >
      <input type="hidden" name="id" value={id} />
      <button disabled={pending || count === 0} className="w-full rounded-full bg-accent py-3 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">
        {pending ? "Verzenden…" : `Verstuur naar ${count} abonnees`}
      </button>
      {state?.error && <p className="mt-2 text-sm font-semibold text-red-500">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm font-semibold text-accentdark">Verzonden naar {state.sent} abonnees ✓</p>}
    </form>
  );
}

// Generic confirm-before-submit button bound to a server action that takes { id }.
export function ConfirmSubmit({ action, id, confirm: msg, label, danger }) {
  const [, formAction, pending] = useActionState(async (_p, fd) => action(fd), null);
  return (
    <form action={formAction} onSubmit={(e) => { if (!confirm(msg)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        className={
          danger
            ? "rounded-full border-2 border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-60"
            : "rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        }
      >
        {pending ? "Bezig…" : label}
      </button>
    </form>
  );
}
