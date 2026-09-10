"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { vinkSessieAf, bewaarCheckin, openWeek } from "@/app/(site)/coaching/actions";

// De week van het lid: de sessies met hun oefeningen, één knop per sessie om af te vinken, en de
// check-in zodra de week rond is.
//
// Waarom afvinken één tik is en geen formulier: er staan zeven workout-logs in deze databank, ooit.
// Alles wat vraagt om sets in te voeren wordt hier niet gebruikt. Eén tik na de sessie is genoeg
// voor de progressie — "te licht / goed / te zwaar" stuurt het gewicht van volgende week.

const OORDELEN = [
  { v: "te_licht", l: "Te licht" },
  { v: "goed", l: "Goed" },
  { v: "te_zwaar", l: "Te zwaar" },
];

export default function WeekPaneel({ week, sessies, oefeningen, checkin, alleSessiesAf, magCheckin = false, isLaatsteWeek, maaltijden = false }) {
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState(null);
  const [open, setOpen] = useState(sessies[0]?.id || null);

  function tik(sessieId, oordeel) {
    setMelding(null);
    start(async () => {
      const fd = new FormData();
      fd.set("sessieId", sessieId);
      if (oordeel) fd.set("oordeel", oordeel);
      const r = await vinkSessieAf(fd);
      setMelding(r?.error || r?.message || null);
    });
  }

  return (
    <div className="space-y-4">
      {sessies.map((s) => {
        const eigen = oefeningen.filter((o) => o.program_day_id === s.program_day_id);
        const gedaan = !!s.gedaan_at;
        const uitgeklapt = open === s.id;
        return (
          <div key={s.id} className={"overflow-hidden rounded-3xl border-2 bg-white transition " + (gedaan ? "border-accent/40" : "border-borderc")}>
            <button type="button" onClick={() => setOpen(uitgeklapt ? null : s.id)}
              className="flex w-full items-center gap-3 p-5 text-left transition hover:bg-paper/60">
              <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black transition " + (gedaan ? "bg-accent text-brand" : "bg-borderc/60 text-brand/40")}>
                {gedaan ? "✓" : s.volgnummer}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-black text-brand">{eigen[0]?.dag?.name || `Sessie ${s.volgnummer}`}</span>
                <span className="block text-xs text-ink-soft">
                  {eigen.length} oefening{eigen.length === 1 ? "" : "en"}
                  {gedaan && s.oordeel ? ` · ${OORDELEN.find((o) => o.v === s.oordeel)?.l.toLowerCase()}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-brand/30">{uitgeklapt ? "▲" : "▼"}</span>
            </button>

            {uitgeklapt && (
              <div className="anim-in border-t border-borderc px-5 pb-5 pt-4">
                <ul className="space-y-2.5">
                  {eigen.map((o) => (
                    <li key={o.id} className="flex items-center gap-3">
                      {o.exercises?.animation_url || o.exercises?.image_url ? (
                        <img src={o.exercises.animation_url || o.exercises.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-paper object-cover" loading="lazy" />
                      ) : (
                        <span className="h-11 w-11 shrink-0 rounded-lg bg-paper" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-brand">
                          {o.exercises?.slug
                            ? <Link href={`/oefeningen/${o.exercises.slug}`} className="hover:underline">{o.exercises?.name}</Link>
                            : o.exercises?.name}
                        </span>
                        <span className="block text-xs text-ink-soft">
                          {o.sets}×{o.reps}
                          {o.target_weight_kg ? ` · ${o.target_weight_kg} kg` : ""}
                          {o.rest_sec ? ` · ${o.rest_sec}s rust` : ""}
                          {o.section && o.section !== "Hoofdoefening" ? ` · ${o.section.toLowerCase()}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 border-t border-borderc pt-4">
                  {!gedaan ? (
                    <>
                      <p className="text-xs font-bold uppercase tracking-wide text-brand/45">Klaar? Hoe voelde het?</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {OORDELEN.map((o) => (
                          <button key={o.v} type="button" disabled={bezig} onClick={() => tik(s.id, o.v)}
                            className="rounded-xl border-2 border-borderc px-3 py-2.5 text-sm font-bold text-brand transition hover:border-accent hover:bg-accent/10 disabled:opacity-50">
                            {o.l}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-brand/40">Dit stuurt het gewicht van je volgende week.</p>
                    </>
                  ) : (
                    <button type="button" disabled={bezig} onClick={() => tik(s.id, null)}
                      className="text-xs font-bold text-brand/45 underline transition hover:text-brand">
                      Toch niet gedaan — vinkje weghalen
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {melding && <p className="rounded-xl bg-paper px-4 py-3 text-sm font-bold text-brand">{melding}</p>}

      {/* De check-in verschijnt zodra de week rond is. Niet eerder: hem vooraf tonen maakt van een
          gesprek een formulier dat er altijd staat. */}
      {magCheckin && !checkin && <Checkin weekId={week.id} maaltijden={maaltijden} alleAf={alleSessiesAf} />}

      {alleSessiesAf && checkin && !isLaatsteWeek && (
        <form action={openWeek}>
          <button type="submit" className="w-full rounded-full bg-accent px-6 py-3.5 text-sm font-bold text-brand transition hover:opacity-90">
            Open mijn volgende week →
          </button>
        </form>
      )}
      {alleSessiesAf && checkin && isLaatsteWeek && (
        <div className="rounded-3xl border-2 border-accent/40 bg-accent/5 p-6 text-center">
          <p className="font-display text-xl font-black text-brand">Je plan is uit 🎉</p>
          <p className="mt-1.5 text-sm text-ink-soft">Je hebt alle weken afgewerkt. Zin in een nieuw plan?</p>
        </div>
      )}
    </div>
  );
}

function Checkin({ weekId, maaltijden, alleAf }) {
  const [bezig, start] = useTransition();
  const [fout, setFout] = useState(null);
  const [pijn, setPijn] = useState(false);

  function verstuur(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("weekId", weekId);
    fd.set("pijn", pijn ? "ja" : "nee");
    setFout(null);
    start(async () => {
      const r = await bewaarCheckin(fd);
      if (r?.error) setFout(r.error);
    });
  }

  return (
    <form onSubmit={verstuur} className="anim-in rounded-3xl border-2 border-brand/15 bg-white p-6">
      <h3 className="font-display text-lg font-black text-brand">{alleAf ? "Je week zit erop — hoe ging het?" : "Hoe ging je week?"}</h3>
      <p className="mt-1 text-sm text-ink-soft">
        {maaltijden ? "Zes tikken" : "Vier tikken"}. Je coach gebruikt dit om je volgende week samen te stellen.
      </p>

      <Rij naam="zwaarte" label="Hoe zwaar voelde het?" opties={[["te_licht", "Te licht"], ["goed", "Goed"], ["te_zwaar", "Te zwaar"]]} />
      <Rij naam="verloop" label="Hoe verliep de week?" opties={[["vlot", "Vlot"], ["wisselend", "Wisselend"], ["moeilijk", "Moeilijk"]]} />
      <Rij naam="energie" label="En je energie?" opties={[["goed", "Goed"], ["ok", "Oké"], ["laag", "Laag"]]} />

      {/* Alleen voor wie een menu volgt. Deze twee antwoorden bepalen of het menu van volgende week
          hetzelfde blijft of opnieuw geschreven wordt — zie `moetVernieuwen` in maaltijd.js. */}
      {maaltijden && (
        <>
          <Rij naam="menu_gevolgd" label="Lukte het weekmenu?" opties={[["vlot", "Vlot"], ["deels", "Deels"], ["niet", "Niet"]]} />
          <Rij naam="honger" label="Had je honger?" opties={[["nee", "Nee"], ["soms", "Soms"], ["vaak", "Vaak"]]} />
        </>
      )}

      <div className="mt-5">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-brand">
          <input type="checkbox" checked={pijn} onChange={(e) => setPijn(e.target.checked)} className="h-5 w-5 accent-accent" />
          Ik had ergens pijn
        </label>
        {pijn && (
          <input name="pijn_waar" maxLength={200} placeholder="Waar precies?"
            className="anim-in mt-2 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-base font-normal text-brand outline-none transition focus:border-accent" />
        )}
        {pijn && <p className="mt-1.5 text-xs text-amber-700">Bij aanhoudende pijn stopt je coach met plannen en stelt hij een echte coach voor.</p>}
      </div>

      <label className="mt-5 block text-sm font-bold text-brand">
        Nog iets? <span className="font-normal text-brand/40">(optioneel)</span>
        <textarea name="vrij" rows={2} maxLength={1000}
          className="mt-1.5 w-full resize-none rounded-xl border-2 border-borderc px-3.5 py-2.5 text-base font-normal text-brand outline-none transition focus:border-accent" />
      </label>

      {fout && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{fout}</p>}

      <button type="submit" disabled={bezig}
        className="mt-5 w-full rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">
        {bezig ? "Bezig…" : "Versturen"}
      </button>
    </form>
  );
}

function Rij({ naam, label, opties }) {
  const [gekozen, setGekozen] = useState("");
  return (
    <div className="mt-5">
      <p className="text-xs font-bold uppercase tracking-wide text-brand/45">{label}</p>
      <input type="hidden" name={naam} value={gekozen} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {opties.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setGekozen(v)}
            className={"rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition " + (gekozen === v ? "border-accent bg-accent/10 text-brand" : "border-borderc text-brand/70 hover:border-lav")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
