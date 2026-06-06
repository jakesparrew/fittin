"use client";
import { useState } from "react";
import { useActionState } from "react";
import { createActivationFull } from "@/app/beheer/activation-actions";

// Step-by-step (typeform-style) builder for an activation campaign:
// 1) Wie wil je activeren?  2) Wat bied je aan?  3) Bericht + naam + bevestig.
export default function ActivationWizard({ segments }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [trigger, setTrigger] = useState(segments[0]?.key || "inactive");
  const [paramValue, setParamValue] = useState(segments[0]?.param?.default ?? 0);
  const [credits, setCredits] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [activate, setActivate] = useState(true);

  const [state, action, pending] = useActionState(async (_p, fd) => {
    const r = await createActivationFull(fd);
    return r || { ok: true };
  }, null);

  const seg = segments.find((s) => s.key === trigger) || segments[0];

  function pickTrigger(s) {
    setTrigger(s.key);
    setParamValue(s.param?.default ?? 0);
  }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setStep(1); }} className="mt-6 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">
        + Nieuwe activatie-campagne
      </button>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-borderc bg-white">
      {/* progress */}
      <div className="flex items-center gap-2 border-b border-borderc px-6 py-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className={"flex h-7 w-7 items-center justify-center rounded-full text-xs font-black " + (step >= n ? "bg-accent text-brand" : "bg-paper text-brand/40")}>{n}</span>
            {n < 3 && <span className={"h-0.5 w-8 " + (step > n ? "bg-accent" : "bg-paper")} />}
          </div>
        ))}
        <span className="ml-2 text-sm font-bold text-brand/60">
          {step === 1 ? "Wie wil je activeren?" : step === 2 ? "Wat bied je aan?" : "Bericht & bevestigen"}
        </span>
        <button onClick={() => setOpen(false)} className="ml-auto text-brand/40 hover:text-brand">✕</button>
      </div>

      <form action={action} className="p-6">
        {/* hidden carriers */}
        <input type="hidden" name="trigger_type" value={trigger} />
        <input type="hidden" name="param_key" value={seg?.param?.key || ""} />
        <input type="hidden" name="param_value" value={paramValue} />
        <input type="hidden" name="reward_credits" value={credits} />
        <input type="hidden" name="discount_percent" value={discount} />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="name" value={name || seg?.label || "Activatie"} />
        <input type="hidden" name="activate" value={activate ? "on" : "off"} />

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-brand/60">Kies de groep leden die de campagne automatisch krijgt.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {segments.map((s) => (
                <button type="button" key={s.key} onClick={() => pickTrigger(s)} className={"rounded-2xl border-2 p-4 text-left transition " + (trigger === s.key ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                  <p className="font-black text-brand">{s.label}</p>
                  <p className="mt-1 text-xs text-brand/55">{s.desc}</p>
                </button>
              ))}
            </div>
            {seg?.param && (
              <label className="mt-2 flex items-center gap-3 rounded-2xl bg-paper p-4">
                <span className="text-sm font-bold text-brand">{seg.param.label}</span>
                <input type="number" min="0" value={paramValue} onChange={(e) => setParamValue(parseInt(e.target.value, 10) || 0)} className="w-24 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-brand/60">Geef ze een reden om terug te komen. Je mag beide combineren of leeg laten.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border-2 border-borderc p-4">
                <p className="font-black text-brand">🎁 Gratis sessie(s)</p>
                <p className="mt-1 text-xs text-brand/55">Wordt automatisch als tegoed op hun account gezet.</p>
                <div className="mt-3 flex items-center gap-2">
                  {[0, 1, 2].map((n) => (
                    <button type="button" key={n} onClick={() => setCredits(n)} className={"h-10 w-12 rounded-xl border-2 font-black transition " + (credits === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border-2 border-borderc p-4">
                <p className="font-black text-brand">🏷️ Korting</p>
                <p className="mt-1 text-xs text-brand/55">Persoonlijke kortingscode in de mail (% op een boeking).</p>
                <div className="mt-3 flex items-center gap-2">
                  {[0, 25, 50].map((n) => (
                    <button type="button" key={n} onClick={() => setDiscount(n)} className={"h-10 rounded-xl border-2 px-3 font-black transition " + (discount === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n === 0 ? "—" : n + "%"}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Interne naam</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={seg?.label} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Onderwerp van de mail</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="We missen je bij Fittin' 💚" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Bericht <span className="text-brand/40">— gebruik {"{{naam}}"} voor de voornaam</span></span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={"Hey {{naam}}, het is al even geleden! Kom terug en pak je gratis sessie."} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 rounded-2xl bg-paper p-3 text-sm font-bold text-brand">
              <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="h-4 w-4 accent-[#5fda6b]" />
              Meteen activeren (draait dagelijks automatisch)
            </label>
            <div className="rounded-2xl bg-accent/5 p-4 text-sm text-brand/70">
              <p className="font-bold text-brand">Samenvatting</p>
              <p className="mt-1">Doel: <b>{seg?.label}</b>{seg?.param ? ` (${seg.param.label.toLowerCase()}: ${paramValue})` : ""}</p>
              <p>Aanbod: {credits > 0 ? `${credits} gratis sessie${credits > 1 ? "s" : ""}` : "geen tegoed"}{discount > 0 ? ` · ${discount}% korting` : ""}</p>
            </div>
            {state?.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
          </div>
        )}

        {/* nav */}
        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => (step === 1 ? setOpen(false) : setStep(step - 1))} className="rounded-full border-2 border-borderc px-5 py-2 text-sm font-bold text-brand transition hover:border-lav">
            {step === 1 ? "Annuleer" : "← Terug"}
          </button>
          {step < 3 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Volgende →</button>
          ) : (
            <button disabled={pending} className="rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">{pending ? "Bezig…" : activate ? "Aanmaken & activeren" : "Opslaan als concept"}</button>
          )}
        </div>
      </form>
    </div>
  );
}
