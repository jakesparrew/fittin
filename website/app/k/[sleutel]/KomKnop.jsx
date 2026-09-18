"use client";
import { useState, useTransition } from "react";
import { bevestigKomst } from "./actions";

// Bewust een knop en geen link die meteen schrijft: mailscanners openen links vooraf en zouden anders namens de
// gast "ik kom" zeggen.
export default function KomKnop({ sleutel, al, host }) {
  const [klaar, setKlaar] = useState(al);
  const [fout, setFout] = useState(null);
  const [pending, start] = useTransition();
  if (klaar) {
    return (
      <div className="mt-6 rounded-2xl bg-accent/10 p-5 text-center">
        <p className="text-3xl" aria-hidden>✅</p>
        <p className="mt-2 font-black text-ink">Top, je bent erbij!</p>
        <p className="mt-1 text-sm text-ink-soft">{host} weet het. Je krijgt je deurcode via {host} — kom samen binnen.</p>
      </div>
    );
  }
  return (
    <>
      <button type="button" disabled={pending}
        onClick={() => start(async () => { const r = await bevestigKomst(sleutel); if (r?.error) setFout(r.error); else setKlaar(true); })}
        className="mt-6 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50">
        {pending ? "Bezig…" : "✅ Ik kom"}
      </button>
      {fout && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}
    </>
  );
}
