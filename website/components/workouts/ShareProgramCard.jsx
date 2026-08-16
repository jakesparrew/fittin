"use client";
import { useState, useTransition } from "react";
import { toggleShareLink } from "@/app/(site)/oefeningen/loop-actions";

const toast = (type, msg) => {
  try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {}
};

// Deel je schema met een vriend. Bewust géén losse "publiceer"-schakelaar met kleine lettertjes:
// één knop die een link maakt, één knop die hem intrekt, en de link staat er meteen bij.
//
// De WhatsApp-knop is er omdat dat het kanaal is waar dit in het echt gebeurt — een schema deel je
// met je trainingsmaat, niet met het internet.
export default function ShareProgramCard({ programId, programName, initialToken = null, site = "" }) {
  const [token, setToken] = useState(initialToken);
  const [pending, start] = useTransition();
  const url = token ? `${site}/w/${token}` : "";

  const wissel = (uit) =>
    start(async () => {
      const fd = new FormData();
      fd.set("programId", programId);
      if (uit) fd.set("uit", "1");
      const r = await toggleShareLink(fd);
      if (r?.error) return toast("error", r.error);
      setToken(uit ? null : r.token);
      toast("success", r.message);
    });

  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("success", "Link gekopieerd ✓");
    } catch {
      toast("error", "Kopiëren lukte niet — selecteer de link handmatig.");
    }
  };

  const waTekst = encodeURIComponent(`Dit is mijn schema "${programName}" bij Fittin' — je kan het zo overnemen: ${url}`);

  return (
    <div className="mt-4 rounded-2xl border border-borderc bg-paper/50 p-4">
      {!token ? (
        <>
          <p className="text-sm font-bold text-brand">Deel dit schema</p>
          <p className="mt-0.5 text-xs text-brand/55">
            Maakt een link die iedereen kan openen zonder account. Zij zien enkel de oefeningen, niet jouw gewichten of voortgang.
          </p>
          <button onClick={() => wissel(false)} disabled={pending} className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {pending ? "Bezig…" : "🔗 Maak deellink"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-brand">Je deellink staat klaar</p>
          <p className="mt-2 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-brand/70">{url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={kopieer} className="rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm font-bold text-brand transition hover:border-accent">Kopieer</button>
            <a href={`https://wa.me/?text=${waTekst}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-accent px-4 py-2 text-sm font-black text-brand transition hover:opacity-90">Stuur via WhatsApp</a>
            <button onClick={() => wissel(true)} disabled={pending} className="rounded-full px-4 py-2 text-sm font-bold text-brand/45 transition hover:text-red-600 disabled:opacity-50">Link intrekken</button>
          </div>
          <p className="mt-2 text-[11px] text-brand/45">Intrekken maakt de oude link meteen ongeldig.</p>
        </>
      )}
    </div>
  );
}
