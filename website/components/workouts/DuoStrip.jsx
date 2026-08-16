"use client";
import { useEffect, useState } from "react";

// Strookje in de workout-speler: welke buddy is vandaag óók bezig, en hoe ver staat hij?
//
// Leeg = onzichtbaar (owner-regel tegen schermvervuiling): heb je geen buddies, of heeft niemand
// zichtbaarheid aangezet, dan zie je hier helemaal niets in plaats van een lege doos.
export default function DuoStrip({ peIds = [] }) {
  const [buddies, setBuddies] = useState([]);

  useEffect(() => {
    if (!peIds.length) return;
    let levend = true;
    const haal = () =>
      fetch(`/api/me/duo?pe=${encodeURIComponent(peIds.slice(0, 60).join(","))}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (levend) setBuddies(d.buddies || []); })
        .catch(() => {});
    haal();
    // Elke 30 s: een workout duurt een uur, sneller verversen levert niets op en kost batterij.
    const t = setInterval(haal, 30000);
    return () => { levend = false; clearInterval(t); };
  }, [peIds]);

  if (!buddies.length) return null;

  return (
    <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/5 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-accentdark">Ook nu bezig</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {buddies.map((b, i) => (
          <span key={i} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand">
            {b.naam} · {b.oefeningen} {b.oefeningen === 1 ? "oefening" : "oefeningen"}
            {b.sets ? ` · ${b.sets} sets` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
