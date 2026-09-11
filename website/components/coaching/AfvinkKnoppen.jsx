"use client";
import { useState, useTransition } from "react";
import { vinkAfViaToken, haalVinkjeWeg } from "@/app/s/[token]/actions";
import { AFVINK_OORDELEN } from "@/lib/coaching/levering.js";

// De drie knoppen op /s/{token}, voor iemand die NIET ingelogd is.
//
// Waarom dit een client component met een echte POST is en geen drie links: de eerste versie liet
// de mail rechtstreeks `?v=goed` wegschrijven tijdens het renderen. Twee dingen braken daarop.
// Een linkscanner die elke URL in een mail ophaalt koos dan het oordeel voor het lid — en de
// verdediging daartegen ("de mail vertrekt vóór de sessie") klopte niet, want de deurcodemail kan
// tot zestien minuten ná de start vertrekken en gaat bij een verplaatste boeking opnieuw uit.
// Daarnaast bleef `?v=` in de adresbalk staan, waardoor "vinkje weghalen" zichzelf bij de volgende
// render meteen terugzette.
//
// Eén tik in de mail opent dit scherm, één tik hier legt het vast. Dat is één tik meer dan beloofd
// en oneindig veel minder dan inloggen.

export default function AfvinkKnoppen({ token, gedaan, oordeel }) {
  const [bezig, start] = useTransition();
  const [fout, setFout] = useState(null);
  // Optimistisch, zodat de knop meteen reageert: de serveractie herlaadt de pagina toch.
  const [gekozen, setGekozen] = useState(oordeel || null);
  const [af, setAf] = useState(!!gedaan);

  function tik(v) {
    setFout(null);
    setGekozen(v);
    setAf(true);
    start(async () => {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("oordeel", v);
      const r = await vinkAfViaToken(fd);
      if (r?.error) { setFout(r.error); setGekozen(oordeel || null); setAf(!!gedaan); }
    });
  }

  function weg() {
    setFout(null);
    setGekozen(null);
    setAf(false);
    start(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const r = await haalVinkjeWeg(fd);
      if (r?.error) { setFout(r.error); setGekozen(oordeel || null); setAf(!!gedaan); }
    });
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {AFVINK_OORDELEN.map((o) => (
          <button key={o.v} type="button" disabled={bezig} onClick={() => tik(o.v)}
            className={"rounded-xl border-2 px-2 py-3 text-center text-sm font-bold transition disabled:opacity-60 " +
              (gekozen === o.v ? "border-accent bg-accent/10 text-ink" : "border-borderc text-ink/70 hover:border-accent")}>
            {o.l}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/45">
        {af ? "Dit stuurt je volgende week: zwaarder, gelijk of lichter. Vergist? Tik gewoon een andere." : "Eén tik is genoeg. Meer vragen we niet."}
      </p>

      {fout && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{fout}</p>}

      {af && (
        <button type="button" onClick={weg} disabled={bezig}
          className="mt-4 text-xs font-bold text-ink/45 underline transition hover:text-ink disabled:opacity-60">
          Toch niet getraind — vinkje weghalen
        </button>
      )}
    </>
  );
}
