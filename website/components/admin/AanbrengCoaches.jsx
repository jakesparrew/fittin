"use client";
import { useMemo, useState } from "react";
import ActionForm from "@/components/ui/ActionForm";
import { zetVerplichteClient } from "@/app/beheer/aanbreng-actions";

// De coachlijst met twee dingen die er anders door elkaar liepen: neemt deze coach nieuwe klanten
// aan, en moet hij bij elke boeking een naam invullen. Dat zijn twee verschillende vragen, dus
// staan ze nu in twee kolommen in plaats van in één regel tekst.
//
// De zoekbalk verschijnt pas vanaf acht coaches. Een zoekbalk boven vier namen is meubilair.

const invoer = "rounded-lg border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent";

export default function AanbrengCoaches({ coaches }) {
  const [zoek, setZoek] = useState("");

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter((c) => `${c.full_name || ""} ${c.email || ""}`.toLowerCase().includes(q));
  }, [coaches, zoek]);

  const verplicht = coaches.filter((c) => c.coach_require_client).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-borderc bg-white">
      <div className="border-b border-borderc px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-brand">Naam van de klant verplicht</p>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-brand/55">
              Zonder naam bij een sessie valt niet te zien of het om een aangebrachte klant gaat. Daarom
              gaat dit vanzelf aan zodra een coach zijn eerste aangebrachte klant aanvaardt. Je kan het
              hier per coach weer uitzetten.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/55">
            {verplicht} van {coaches.length} verplicht
          </span>
        </div>
        {coaches.length >= 8 && (
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een coach…"
            className={invoer + " mt-3 w-full sm:w-72"} />
        )}
      </div>

      {zichtbaar.length === 0 ? (
        <p className="px-5 py-6 text-sm text-brand/50">Geen coach gevonden voor &ldquo;{zoek.trim()}&rdquo;.</p>
      ) : (
        zichtbaar.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-borderc px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-brand">{c.full_name || c.email}</p>
              <p className="truncate text-xs text-brand/45">{c.email}</p>
            </div>

            <span className={"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (c.coach_accepting_clients ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/45")}>
              {c.coach_accepting_clients ? "neemt klanten aan" : "neemt niets aan"}
            </span>

            <div className="flex shrink-0 items-center gap-3">
              <span className={"rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (c.coach_require_client ? "bg-brand text-white" : "bg-paper text-brand/45")}>
                {c.coach_require_client ? "naam verplicht" : "naam vrij"}
              </span>
              <ActionForm action={zetVerplichteClient} success="Aangepast ✓">
                <input type="hidden" name="coachId" value={c.id} />
                <input type="hidden" name="aan" value={c.coach_require_client ? "0" : "1"} />
                <button className="rounded-full border-2 border-borderc bg-white px-4 py-2 text-xs font-bold text-brand transition hover:border-lav">
                  {c.coach_require_client ? "Uitzetten" : "Aanzetten"}
                </button>
              </ActionForm>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
