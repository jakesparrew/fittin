"use client";
import { useState } from "react";

// Deurzekerheid. Leden vreesden voor een gesloten deur te staan omdat de app tot ~5 min vóór de
// sessie niets zei over de code (echte klachten: iemand stond effectief buiten). Deze kaart staat
// er ALTIJD — ook zonder code — zodat je vooraf weet wat er gaat gebeuren; zodra de code er is,
// toont ze hem groot en kopieerbaar.
// Bewust geen Date.now() hier: de server beslist of er een code is, zodat SSR en client identiek
// renderen (zie de hydration-fix in NextSessionTimer).
export default function DoorCodeCard({ code, leadMin = 5, dark = false }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "success", msg: "Deurcode gekopieerd" } }));
    } catch {
      // Clipboard geweigerd (oudere webview / geen https-context) — overtypen kan altijd.
      window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "error", msg: "Kopiëren lukte niet — typ de code over" } }));
    }
  }

  if (!code) {
    return (
      <div className={"mt-3 flex items-start gap-3 rounded-xl px-4 py-3 " + (dark ? "bg-white/10" : "bg-paper")}>
        <span className="text-xl leading-none">🔑</span>
        <div className="min-w-0">
          <p className={"text-sm font-bold " + (dark ? "text-white" : "text-brand")}>
            Je deurcode verschijnt hier én in je mailbox ±{leadMin} min vóór de start.
          </p>
          <p className={"mt-0.5 text-xs " + (dark ? "text-lav" : "text-brand/55")}>
            Je staat dus nooit voor een gesloten deur. Tijdens je sessie kan je de deur ook met één tik openen vanuit je account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={"mt-3 rounded-xl px-4 py-3 " + (dark ? "bg-white/10" : "bg-accent/10")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl leading-none">🔑</span>
        <div>
          <p className={"text-[11px] font-bold uppercase tracking-wide " + (dark ? "text-accent" : "text-accentdark")}>Jouw deurcode</p>
          <p className={"text-3xl font-black tabular-nums tracking-[0.2em] " + (dark ? "text-white" : "text-brand")}>{code}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className={"ml-auto rounded-full px-4 py-2 text-sm font-bold transition " + (dark ? "bg-accent text-brand hover:opacity-90" : "border-2 border-borderc bg-white text-brand hover:border-accent")}
        >
          {copied ? "Gekopieerd ✓" : "📋 Kopieer"}
        </button>
      </div>
      <p className={"mt-2 text-xs " + (dark ? "text-lav" : "text-brand/55")}>
        Toets hem in op het paneel naast de voordeur. De code werkt enkel tijdens jouw tijdslot.
      </p>
    </div>
  );
}
