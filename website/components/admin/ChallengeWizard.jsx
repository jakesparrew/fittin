"use client";
import { useState, useActionState } from "react";
import { createChallenge } from "@/app/beheer/community-actions";

const GOALS = [
  { key: "sessions", label: "Aantal sessies", desc: "Haal X sessies binnen de looptijd." },
  { key: "daluren", label: "Sessies in daluren", desc: "X sessies tijdens rustige uren." },
  { key: "streak", label: "Streak (weken)", desc: "X weken op rij minstens één sessie." },
];

// Step-by-step builder for a community challenge: 1) doel 2) beloning 3) naam + looptijd.
export default function ChallengeWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [goalType, setGoalType] = useState("sessions");
  const [goalCount, setGoalCount] = useState(12);
  const [reward, setReward] = useState(5);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const [, action, pending] = useActionState(async (_p, fd) => {
    const r = await createChallenge(fd);
    if (!r?.error) setOpen(false);
    return r || { ok: true };
  }, null);

  const goal = GOALS.find((g) => g.key === goalType);

  if (!open) {
    return <button onClick={() => { setOpen(true); setStep(1); }} className="mt-6 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">+ Nieuwe challenge</button>;
  }

  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-borderc bg-white">
      <div className="flex items-center gap-2 border-b border-borderc px-6 py-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className={"flex h-7 w-7 items-center justify-center rounded-full text-xs font-black " + (step >= n ? "bg-accent text-brand" : "bg-paper text-brand/40")}>{n}</span>
            {n < 3 && <span className={"h-0.5 w-8 " + (step > n ? "bg-accent" : "bg-paper")} />}
          </div>
        ))}
        <span className="ml-2 text-sm font-bold text-brand/60">{step === 1 ? "Wat is de uitdaging?" : step === 2 ? "Wat win je?" : "Naam & looptijd"}</span>
        <button onClick={() => setOpen(false)} className="ml-auto text-brand/40 hover:text-brand">✕</button>
      </div>

      <form action={action} className="p-6">
        <input type="hidden" name="goal_type" value={goalType} />
        <input type="hidden" name="goal_count" value={goalCount} />
        <input type="hidden" name="reward_credits" value={reward} />
        <input type="hidden" name="name" value={name || `${goalCount}× ${goal?.label}`} />
        <input type="hidden" name="starts_on" value={startsOn} />
        <input type="hidden" name="ends_on" value={endsOn} />

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {GOALS.map((g) => (
                <button type="button" key={g.key} onClick={() => setGoalType(g.key)} className={"rounded-2xl border-2 p-4 text-left transition " + (goalType === g.key ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                  <p className="font-black text-brand">{g.label}</p>
                  <p className="mt-1 text-xs text-brand/55">{g.desc}</p>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-3 rounded-2xl bg-paper p-4">
              <span className="text-sm font-bold text-brand">Doel-aantal</span>
              <input type="number" min="1" value={goalCount} onChange={(e) => setGoalCount(parseInt(e.target.value, 10) || 1)} className="w-24 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-brand/60">Wie het haalt krijgt gratis sessies als tegoed op zijn account.</p>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 5, 10].map((n) => (
                <button type="button" key={n} onClick={() => setReward(n)} className={"h-12 rounded-2xl border-2 px-5 font-black transition " + (reward === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n} sessie{n > 1 ? "s" : ""}</button>
              ))}
            </div>
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
            <div className="rounded-2xl bg-accent/5 p-4 text-sm text-brand/70">
              <p className="font-bold text-brand">Samenvatting</p>
              <p className="mt-1">{goalCount}× {goal?.label} · beloning {reward} sessie{reward > 1 ? "s" : ""}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => (step === 1 ? setOpen(false) : setStep(step - 1))} className="rounded-full border-2 border-borderc px-5 py-2 text-sm font-bold text-brand transition hover:border-lav">{step === 1 ? "Annuleer" : "← Terug"}</button>
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
