"use client";
import { useState, useTransition } from "react";
import { sendInsightPreset, enrollInsightDrip, snoozeInsight } from "@/app/beheer/insight-actions";

// Het actiemenu onder een inzicht: van "dit is een probleem" naar "dit is opgelost" zonder de
// pagina te verlaten. Owner-doel: een inzicht mag geen doodlopende link naar een lijst zijn.
//
// De knoppen zijn bewust beschrijvend ("Stuur zijn rekensom") in plaats van generiek ("E-mail"):
// de beheerder moet zonder nadenken zien wat er precies vertrekt. Het resultaat verschijnt inline
// op de kaart — een toast verdwijnt, en "verstuurd ✓" naast de knop is het bewijs dat je klaar
// bent met deze kaart.
const toast = (type, msg) => {
  try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {}
};

function Knop({ label, busyLabel, onClick, tone = "wit" }) {
  const [pending, start] = useTransition();
  const cls = tone === "accent"
    ? "bg-accent text-brand hover:opacity-90"
    : tone === "stil"
      ? "bg-transparent text-brand/40 hover:text-brand"
      : "border border-borderc bg-white text-brand/70 hover:border-accent hover:text-brand";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(onClick)}
      className={`rounded-full px-3 py-1 text-[11px] font-bold transition disabled:opacity-50 ${cls}`}
    >
      {pending ? (busyLabel || "Bezig…") : label}
    </button>
  );
}

// `acties` is een lijst van { type: 'preset'|'reeks'|'snooze', ... } — de kaart beslist wat
// relevant is, dit component voert enkel uit en toont het resultaat.
export default function InsightActions({ memberId, acties = [], eindDatum = null }) {
  const [klaar, setKlaar] = useState(null); // laatste gelukte actie, inline getoond

  const voerUit = async (actie) => {
    const fd = new FormData();
    fd.set("memberId", memberId);
    let r;
    if (actie.type === "preset") {
      fd.set("preset", actie.preset);
      if (eindDatum) fd.set("eindDatum", eindDatum);
      r = await sendInsightPreset(fd);
    } else if (actie.type === "reeks") {
      fd.set("reeks", actie.reeks);
      r = await enrollInsightDrip(fd);
    } else {
      fd.set("kind", actie.kind);
      fd.set("dagen", String(actie.dagen || 60));
      r = await snoozeInsight(fd);
    }
    if (r?.error) toast("error", r.error);
    else { setKlaar(r?.message || "Gedaan ✓"); toast("success", r?.message || "Gedaan ✓"); }
  };

  if (klaar) return <p className="mt-2 text-[11px] font-bold text-accentdark">{klaar}</p>;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {acties.map((a, i) => (
        <Knop
          key={i}
          label={a.label}
          busyLabel={a.busy}
          tone={a.tone || (i === 0 ? "accent" : a.type === "snooze" ? "stil" : "wit")}
          onClick={() => voerUit(a)}
        />
      ))}
    </div>
  );
}
