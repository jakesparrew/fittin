"use client";
import { useEffect, useState } from "react";
import useIsApp from "./useIsApp";

const DISMISS_KEY = "fittin-push-uitgesteld";
const DISMISS_DAYS = 21;

// "Zet meldingen aan" — the in-context pre-prompt (playbook §15). The system permission dialog can
// be shown exactly once; asking cold on launch wastes it. This card explains the value first, and
// only the tap on the button triggers the real dialog. App only; renders nothing on the website.
export default function PushOptIn({ className = "" }) {
  const app = useIsApp();
  const [status, setStatus] = useState(null); // null = unknown yet
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!app) return;
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (t && Date.now() - t < DISMISS_DAYS * 86400000) return;
    } catch { /* show it */ }
    import("@/lib/native/push").then(({ pushStatus }) => pushStatus()).then(setStatus).catch(() => {});
  }, [app]);

  if (!app || (status !== "prompt" && status !== "denied")) return null;

  async function aanzetten() {
    setBusy(true);
    const [{ enablePush }, { hapticSuccess }] = await Promise.all([import("@/lib/native/push"), import("@/lib/native/haptics")]);
    const r = await enablePush().catch(() => "prompt");
    setBusy(false);
    if (r === "granted") {
      hapticSuccess();
      setStatus("granted");
    } else setStatus(r);
  }

  function later() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setStatus("granted"); // just hide it
  }

  return (
    <section className={"rounded-3xl border border-borderc bg-surface p-5 " + className}>
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-xl" aria-hidden>🔔</span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-ink">Meldingen aanzetten</p>
          {status === "denied" ? (
            <p className="mt-1 text-sm text-ink/60">
              Meldingen staan uit voor Fittin’. Zet ze aan via Instellingen → Fittin’ → Meldingen, dan hoor je het meteen als je coach reageert of je sessie verschuift.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink/60">
              Hoor het meteen als je coach je plan aanpast, een plekje vrijkomt of je sessie verschuift. Nooit reclame.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {status === "prompt" && (
              <button onClick={aanzetten} disabled={busy} className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand disabled:opacity-50">
                {busy ? "Even geduld…" : "Zet aan"}
              </button>
            )}
            <button onClick={later} className="rounded-full px-4 py-2.5 text-sm font-bold text-ink/55">Later</button>
          </div>
        </div>
      </div>
    </section>
  );
}
