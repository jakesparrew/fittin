"use client";

// Opent de coach-chat (CoachKnop luistert naar "coach:open"). Een kaart i.p.v. enkel de zwevende knop: op de
// coachingpagina moet het meteen duidelijk zijn dat je met je coach kan praten, en wat hij kan.
export default function OpenCoachKaart() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("coach:open"))}
      className="mt-5 flex w-full items-center justify-between gap-3 rounded-3xl border-2 border-brand/15 bg-surface p-4 text-left transition hover:border-accent"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-black text-ink">
          💬 Praat met je coach <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-ink">testfase</span>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
          Een moment boeken of verplaatsen, een oefening uitgelegd of gewisseld, je check-in in een gesprekje. Niets gebeurt zonder jouw bevestiging.
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-black text-brand">Open</span>
    </button>
  );
}
