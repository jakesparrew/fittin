"use client";
import { useState } from "react";
import { useActie } from "@/components/ui/useActie";
import { createChallenge } from "@/app/beheer/community-actions";

const GOALS = [
  { key: "sessions", label: "Aantal sessies", desc: "Haal X sessies binnen de looptijd." },
  { key: "daluren", label: "Sessies in daluren", desc: "X sessies tijdens rustige uren." },
  { key: "streak", label: "Streak (weken)", desc: "X weken op rij minstens één sessie." },
];

// Sjablonen (0165 §4.8): een lege wizard leverde nul challenges op. Eén tik vult alles in — de uitbater kijkt na en
// bevestigt. Enkel doeltypes die award_challenges() écht uitbetaalt (0148).
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
function dezeMaand() {
  const [j, m] = ymd(new Date()).split("-").map(Number);
  return { van: ymd(new Date()), tot: ymd(new Date(Date.UTC(j, m, 0, 12))) };
}
const SJABLONEN = [
  { l: "🔥 4 weken op rij", goalType: "streak", goalCount: 4, reward: 1, max: 10, name: "4 weken op rij", looptijd: 42 },
  { l: "💪 8 sessies deze maand", goalType: "sessions", goalCount: 8, reward: 1, max: 10, name: "8 sessies deze maand", maand: true },
  { l: "⚡ Rustige-urenmaand", goalType: "daluren", goalCount: 6, reward: 1, max: 10, name: "6× op een rustig uur", maand: true },
];

// Step-by-step builder for a community challenge: 1) doel 2) beloning 3) naam + looptijd.
export default function ChallengeWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [goalType, setGoalType] = useState("sessions");
  // Plafond op het aantal winnaars. Zonder dit staat er geen bovengrens op wat een challenge kost:
  // haalt iedereen hem, dan betaal je iedereen. Standaard 15 — ruim boven de 7 leden die ooit tien
  // sessies haalden, dus het knelt in de praktijk niet, maar de kost is wél begrensd.
  const [maxWinners, setMaxWinners] = useState(15);
  const [goalCount, setGoalCount] = useState(12);
  const [reward, setReward] = useState(5);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  // Hier werd het resultaat weggegooid (`const [, action]`): bij een fout bleef de wizard gewoon open
  // staan zonder één woord uitleg. Nu komt elke uitkomst als melding.
  const [, action, pending] = useActie(async (fd) => {
    const r = await createChallenge(fd);
    if (!r?.error) setOpen(false);
    return r;
  });

  const goal = GOALS.find((g) => g.key === goalType);

  function gebruik(t) {
    setGoalType(t.goalType); setGoalCount(t.goalCount); setReward(t.reward); setMaxWinners(t.max); setName(t.name);
    if (t.maand) { const m = dezeMaand(); setStartsOn(m.van); setEndsOn(m.tot); }
    else { setStartsOn(ymd(new Date())); setEndsOn(ymd(new Date(Date.now() + t.looptijd * 86400000))); }
    setOpen(true); setStep(3);
  }

  if (!open) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button onClick={() => { setOpen(true); setStep(1); }} className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">+ Nieuwe challenge</button>
        <span className="ml-2 text-xs font-bold text-ink/50">of een sjabloon:</span>
        {SJABLONEN.map((t) => (
          <button key={t.l} type="button" onClick={() => gebruik(t)} className="rounded-full border border-borderc bg-surface px-4 py-2 text-xs font-bold text-ink transition hover:border-lav">{t.l}</button>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-borderc bg-surface">
      <div className="flex items-center gap-2 border-b border-borderc px-6 py-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className={"flex h-7 w-7 items-center justify-center rounded-full text-xs font-black " + (step >= n ? "bg-accent text-brand" : "bg-paper text-ink/40")}>{n}</span>
            {n < 3 && <span className={"h-0.5 w-8 " + (step > n ? "bg-accent" : "bg-paper")} />}
          </div>
        ))}
        <span className="ml-2 text-sm font-bold text-ink/60">{step === 1 ? "Wat is de uitdaging?" : step === 2 ? "Wat win je?" : "Naam & looptijd"}</span>
        <button onClick={() => setOpen(false)} className="ml-auto text-ink/40 hover:text-ink">✕</button>
      </div>

      <form action={action} className="p-6">
        <input type="hidden" name="goal_type" value={goalType} />
        <input type="hidden" name="goal_count" value={goalCount} />
        <input type="hidden" name="reward_credits" value={reward} />
        <input type="hidden" name="name" value={name || `${goalCount}× ${goal?.label}`} />
        <input type="hidden" name="starts_on" value={startsOn} />
        <input type="hidden" name="ends_on" value={endsOn} />
        <input type="hidden" name="max_winners" value={maxWinners} />

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {GOALS.map((g) => (
                <button type="button" key={g.key} onClick={() => setGoalType(g.key)} className={"rounded-2xl border-2 p-4 text-left transition " + (goalType === g.key ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                  <p className="font-black text-ink">{g.label}</p>
                  <p className="mt-1 text-xs text-ink/55">{g.desc}</p>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-3 rounded-2xl bg-paper p-4">
              <span className="text-sm font-bold text-ink">Doel-aantal</span>
              <input type="number" min="1" value={goalCount} onChange={(e) => setGoalCount(parseInt(e.target.value, 10) || 1)} className="w-24 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-ink/60">Wie het haalt krijgt gratis sessies als tegoed op zijn account.</p>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 5, 10].map((n) => (
                <button type="button" key={n} onClick={() => setReward(n)} className={"h-12 rounded-2xl border-2 px-5 font-black transition " + (reward === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n} sessie{n > 1 ? "s" : ""}</button>
              ))}
            </div>
            {/* De rem. Een challenge zonder plafond kan iedereen halen, en dan betaal je iedereen. */}
            <label className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-4">
              <span className="text-sm font-bold text-ink">Hoogstens</span>
              <input type="number" min="1" value={maxWinners} onChange={(e) => setMaxWinners(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-24 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              <span className="text-sm font-bold text-ink">winnaars</span>
              <span className="w-full text-xs text-ink-soft">
                Kost je dus hoogstens {maxWinners * reward} sessie{maxWinners * reward === 1 ? "" : "s"} — ongeveer € {(maxWinners * reward * 3.5).toFixed(0)} aan echte kosten. Wie eerst is, is eerst.
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Naam</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${goalCount}× ${goal?.label}`} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Start (optioneel)</span><input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Einde (optioneel)</span><input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></label>
            </div>
            <div className="rounded-2xl bg-accent/5 p-4 text-sm text-ink/70">
              <p className="font-bold text-ink">Samenvatting</p>
              <p className="mt-1">{goalCount}× {goal?.label} · beloning {reward} sessie{reward > 1 ? "s" : ""}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => (step === 1 ? setOpen(false) : setStep(step - 1))} className="rounded-full border-2 border-borderc px-5 py-2 text-sm font-bold text-ink transition hover:border-lav">{step === 1 ? "Annuleer" : "← Terug"}</button>
          {step < 3 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Volgende →</button>
          ) : (
            <button disabled={pending} className="rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">{pending ? "Bezig…" : "Challenge aanmaken"}</button>
          )}
        </div>
      </form>
    </div>
  );
}
