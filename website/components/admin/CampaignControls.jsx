"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendNewsletter } from "@/app/beheer/newsletter-actions";
import { runActivationNow } from "@/app/beheer/activation-actions";

// Live send-progress bar — polls while the queue drains.
export function SendProgress({ id, initial }) {
  const [c, setC] = useState(initial);
  const router = useRouter();
  useEffect(() => {
    if (c.status !== "sending") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/campaign-progress?id=${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        setC(d);
        if (d.status !== "sending") { clearInterval(t); router.refresh(); }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [id, c.status, router]);

  const total = c.total || 0;
  const sent = c.sent || 0;
  const pctv = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  const sending = c.status === "sending";
  return (
    <div className="rounded-2xl border border-borderc bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-brand">{sending ? "Aan het verzenden…" : "Verzonden ✓"}</h2>
        <span className="text-sm font-bold text-brand">{sent} / {total}</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-paper">
        <div className={"h-full rounded-full bg-accent transition-all duration-500" + (sending ? " animate-pulse" : "")} style={{ width: pctv + "%" }} />
      </div>
      <p className="mt-2 text-xs text-brand/50">
        {sending ? "De nieuwsbrief wordt in batches verstuurd in de achtergrond — je kan deze pagina sluiten." : "Verzending afgerond."}
      </p>
      {c.failed > 0 && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {c.failed} e-mail{c.failed > 1 ? "s" : ""} niet verzonden. Controleer of <code>RESEND_API_KEY</code> in Vercel geldig is.
        </p>
      )}
    </div>
  );
}

// Run an activation campaign now (confirm + inline result).
export function RunActivationButton({ id, matches }) {
  const [state, action, pending] = useActionState(async (_p, fd) => runActivationNow(fd), null);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(`Nu versturen naar de leden die matchen (max ${matches})?`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-60">
        {pending ? "Versturen…" : "Nu versturen"}
      </button>
      {state?.error && <p className="mt-2 text-sm font-semibold text-red-500">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm font-semibold text-accentdark">Verzonden naar {state.sent} leden ({state.matched} matchten).</p>}
    </form>
  );
}

// Queue a newsletter (drains in the background) — confirm, then refresh into the progress view.
export function SendNewsletterButton({ id, count }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const r = await sendNewsletter(fd);
    if (r?.ok) router.refresh();
    return r;
  }, null);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`Nieuwsbrief verzenden naar ${count} abonnees? Hij wordt in de achtergrond verstuurd.`)) e.preventDefault(); }}
      className="mt-4"
    >
      <input type="hidden" name="id" value={id} />
      <button disabled={pending || count === 0} className="w-full rounded-full bg-accent py-3 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">
        {pending ? "In wachtrij plaatsen…" : `Verstuur naar ${count} abonnees`}
      </button>
      {state?.error && <p className="mt-2 text-sm font-semibold text-red-500">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm font-semibold text-accentdark">{state.queued} e-mails in de wachtrij — verzenden gestart ✓</p>}
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
