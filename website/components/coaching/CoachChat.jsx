"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { laadGesprek, akkoordCoachChat, voerCoachActieUit, weigerCoachActie, vergeetFeit, wisGesprek } from "@/app/(site)/coaching/chat-actions";
import { kaartTekst } from "@/lib/coaching/chat-tools";
import { MAX_LENGTE } from "@/lib/coaching/chat-regels";
import { bevestig } from "@/lib/native/dialogs";

// De coach-chat. Drie beloftes die op het scherm moeten staan, niet in een voetnoot:
//   1. testfase — hij kan fouten maken;  2. geen medisch advies;  3. er gebeurt niets zonder jouw tik.
// Wat hij kan, staat in KAN — één lijst voor het introscherm én voor "Wat kan je coach?" in het gesprek.

const KAN = [
  ["📅", "Een vrij moment zoeken en voor je boeken", "ook rustige uren ⚡: 2e uur gratis"],
  ["🔁", "Een sessie verplaatsen", "tot 6 uur vooraf"],
  ["🏋️", "Oefeningen uitleggen of wisselen in je plan", "toestel bezet? te zwaar?"],
  ["✅", "Je wekelijkse check-in in een gesprekje", "je plan past zich aan"],
  ["🧠", "Onthouden wat je hem vertelt", "je ziet en wist het zelf"],
];
const NIET = [
  "Geen medisch advies of diagnose — bij pijn verwijst hij je door naar een echte coach of arts.",
  "Hij doet niets zelf: boeken, verplaatsen of wisselen gebeurt pas als jij op de knop tikt.",
  "Hij kan fouten maken. Kijk na wat hij voorstelt.",
];
const VOORBEELDEN = ["Zoek een rustig uur deze week", "Verplaats mijn volgende sessie naar zaterdag", "Hoe doe ik een goede deadlift?", "Wat eet ik best na mijn training?"];

const STATUS = {
  uitgevoerd: ["✓ Gedaan", "text-accentdark"],
  geweigerd: ["Niet gedaan", "text-ink/40"],
  verlopen: ["Verlopen", "text-ink/40"],
  mislukt: ["Ging niet", "text-red-600"],
  bezig: ["Bezig…", "text-ink/50"],
};

/** **vet** en regeleinden — meer opmaak doet de coach niet. */
function Opmaak({ tekst }) {
  return (
    <span className="whitespace-pre-line">
      {String(tekst || "").split("**").map((stuk, i) => (i % 2 ? <b key={i}>{stuk}</b> : <span key={i}>{stuk}</span>))}
    </span>
  );
}

function Kaart({ actie, onJa, onNee, bezig }) {
  const k = kaartTekst(actie);
  const st = STATUS[actie.status];
  return (
    <div className="mt-2 rounded-2xl border-2 border-accent/40 bg-surface p-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-accentdark">{k.titel}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{k.regel}</p>
      {actie.type === "stel_boeking_voor" && actie.invoer?.uren >= 0 && (
        <p className="mt-0.5 text-xs text-ink-soft">
          {actie.invoer.welkom ? "Je eerste uur is gratis." : actie.invoer.metTegoed ? `Met ${actie.invoer.uren} uur van je tegoed.` : `Betalen via de gewone betaalpagina (${actie.invoer.uren} uur).`}
          {actie.invoer.promo && actie.invoer.duur >= 2 ? " Het 2e uur is gratis." : ""}
        </p>
      )}
      {actie.status === "voorgesteld" ? (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={bezig} onClick={onJa} className="rounded-full bg-accent px-4 py-2 text-xs font-black text-brand disabled:opacity-50">{k.knop}</button>
          <button type="button" disabled={bezig} onClick={onNee} className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-ink disabled:opacity-50">Nee</button>
        </div>
      ) : (
        <p className={"mt-1 text-xs font-bold " + (st?.[1] || "")}>{st?.[0] || actie.status}{actie.status === "mislukt" && actie.resultaat ? ` — ${actie.resultaat}` : ""}</p>
      )}
    </div>
  );
}

export default function CoachChat({ onSluit = null }) {
  const [staat, setStaat] = useState(null); // { berichten, feiten, akkoord, begin }
  const [tekst, setTekst] = useState("");
  const [denkt, setDenkt] = useState(false);
  const [fout, setFout] = useState("");
  const [toonKan, setToonKan] = useState(false);
  const [toonGeheugen, setToonGeheugen] = useState(false);
  const [actieBezig, setActieBezig] = useState(null);
  const [links, setLinks] = useState({}); // actie-id → { link, checkoutUrl }
  const onder = useRef(null);

  const laad = () => laadGesprek().then((r) => (r?.error ? setFout(r.error) : setStaat(r)));
  useEffect(() => { laad(); }, []);
  useEffect(() => { onder.current?.scrollIntoView({ block: "end" }); }, [staat?.berichten?.length, denkt]);

  async function stuur(t) {
    const inhoud = String(t ?? tekst).trim();
    if (!inhoud || denkt) return;
    setFout(""); setDenkt(true); setTekst("");
    // Meteen tonen wat het lid stuurde; de server geeft zijn eigen versie terug.
    const tijdelijk = { id: `tmp-${Date.now()}`, rol: "lid", tekst: inhoud, acties: [] };
    setStaat((s) => ({ ...s, begin: null, berichten: [...(s?.berichten || []), tijdelijk] }));
    try {
      const res = await fetch("/api/coaching/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tekst: inhoud }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.berichten) {
        setFout(d.error || "Er ging iets mis. Probeer opnieuw.");
        setStaat((s) => ({ ...s, berichten: s.berichten.filter((b) => b.id !== tijdelijk.id) }));
        setTekst(inhoud);
      } else {
        setStaat((s) => ({ ...s, feiten: d.feiten || s.feiten, berichten: [...s.berichten.filter((b) => b.id !== tijdelijk.id), ...d.berichten] }));
      }
    } catch {
      setFout("Geen verbinding. Probeer opnieuw.");
      setStaat((s) => ({ ...s, berichten: s.berichten.filter((b) => b.id !== tijdelijk.id) }));
      setTekst(inhoud);
    } finally {
      setDenkt(false);
    }
  }

  function vervang(bericht, log) {
    setStaat((s) => ({ ...s, berichten: [...s.berichten.map((b) => (bericht && b.id === bericht.id ? bericht : b)), ...(log ? [log] : [])] }));
  }
  async function ja(b, a) {
    setActieBezig(a.id); setFout("");
    const r = await voerCoachActieUit(b.id, a.id);
    setActieBezig(null);
    vervang(r.bericht, r.log);
    if (r.error) setFout(r.error);
    if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
    if (r.link) setLinks((l) => ({ ...l, [a.id]: r.link }));
  }
  async function nee(b, a) {
    setActieBezig(a.id);
    const r = await weigerCoachActie(b.id, a.id);
    setActieBezig(null);
    if (r.bericht) vervang(r.bericht);
    if (r.error) setFout(r.error);
  }
  async function start() {
    const r = await akkoordCoachChat();
    if (r.error) setFout(r.error); else laad();
  }
  async function wis() {
    if (!(await bevestig("Je hele gesprek en alles wat de coach onthield, wordt gewist. Dit kan niet ongedaan gemaakt worden.", { title: "Gesprek wissen?", ok: "Wis alles" }))) return;
    const r = await wisGesprek();
    if (r.error) setFout(r.error); else laad();
  }
  async function vergeet(i) {
    const r = await vergeetFeit(i);
    if (r.feiten) setStaat((s) => ({ ...s, feiten: r.feiten }));
  }

  const Kop = (
    <div className="flex items-start justify-between gap-3 border-b border-borderc px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-base font-black text-ink">
          Je AI-coach <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink">Testfase</span>
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">Kan fouten maken · geen medisch advies · niets gebeurt zonder jouw bevestiging</p>
      </div>
      {onSluit && <button type="button" onClick={onSluit} aria-label="Sluiten" className="-mr-1 rounded-full p-2 text-xl leading-none text-ink/60 hover:bg-paper">×</button>}
    </div>
  );

  if (!staat) {
    return <div className="flex h-full flex-col">{Kop}<p className="p-6 text-sm text-ink-soft">{fout || "Laden…"}</p></div>;
  }

  // ---- Eerste keer: wat hij kan, wat niet, en wat er met je berichten gebeurt ----
  if (!staat.akkoord) {
    return (
      <div className="flex h-full flex-col">
        {Kop}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm font-black text-ink">Wat kan je coach?</p>
          <ul className="mt-2 space-y-2">
            {KAN.map(([ic, t, s]) => (
              <li key={t} className="flex gap-3 rounded-2xl bg-paper px-3 py-2">
                <span className="text-lg">{ic}</span>
                <span className="min-w-0 text-sm text-ink"><b>{t}</b><span className="block text-xs text-ink-soft">{s}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-black text-ink">Goed om te weten</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            {NIET.map((t) => <li key={t} className="flex gap-2"><span>•</span><span>{t}</span></li>)}
          </ul>
          <p className="mt-4 rounded-2xl border border-borderc p-3 text-xs leading-relaxed text-ink-soft">
            Je berichten worden bewaard zodat je ze kan teruglezen, en gaan naar een AI-model (Anthropic, via Vercel) om te antwoorden.
            Je naam en contactgegevens gaan daar niet heen. Je wist alles met één knop. <Link href="/privacy" className="font-bold underline">Privacy</Link>
          </p>
          {fout && <p className="mt-3 text-sm font-bold text-red-600">{fout}</p>}
        </div>
        <div className="border-t border-borderc p-4">
          <button type="button" onClick={start} className="w-full rounded-full bg-accent py-3 text-sm font-black text-brand">Oké, start het gesprek</button>
        </div>
      </div>
    );
  }

  const berichten = staat.berichten || [];
  return (
    <div className="flex h-full flex-col">
      {Kop}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <button type="button" onClick={() => setToonKan((v) => !v)} aria-expanded={toonKan} className="text-xs font-bold text-accentdark underline">
          {toonKan ? "Verberg" : "Wat kan je coach?"}
        </button>
        {toonKan && (
          <ul className="space-y-1 rounded-2xl bg-paper p-3 text-xs text-ink">
            {KAN.map(([ic, t]) => <li key={t}>{ic} {t}</li>)}
            <li className="pt-1 text-ink-soft">Niet: medisch advies. Niets zonder jouw tik.</li>
          </ul>
        )}

        {berichten.map((b) =>
          b.rol === "systeem" ? (
            <p key={b.id} className="text-center text-[11px] font-bold text-ink/50">{b.tekst}</p>
          ) : (
            <div key={b.id} className={b.rol === "lid" ? "flex justify-end" : "flex justify-start"}>
              <div className={"max-w-[85%] rounded-2xl px-3 py-2 text-sm " + (b.rol === "lid" ? "bg-brand text-white" : "bg-paper text-ink")}>
                <Opmaak tekst={b.tekst} />
                {(b.acties || []).map((a) => (
                  <div key={a.id}>
                    <Kaart actie={a} bezig={actieBezig === a.id} onJa={() => ja(b, a)} onNee={() => nee(b, a)} />
                    {links[a.id] && <Link href={links[a.id]} className="mt-1 inline-block text-xs font-bold text-accentdark underline">Bekijk →</Link>}
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {staat.begin && !denkt && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-paper px-3 py-2 text-sm text-ink">
              {staat.begin.tekst}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {staat.begin.keuzes.map((k) => (
                  <button key={k} type="button" onClick={() => stuur(k)} className="rounded-full border border-accent/50 bg-surface px-3 py-1 text-xs font-bold text-accentdark">{k}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {!berichten.length && !staat.begin && (
          <div className="flex flex-wrap gap-1.5">
            {VOORBEELDEN.map((k) => <button key={k} type="button" onClick={() => stuur(k)} className="rounded-full border border-accent/50 bg-surface px-3 py-1 text-xs font-bold text-accentdark">{k}</button>)}
          </div>
        )}
        {denkt && <p className="text-xs font-bold text-ink/50">Je coach denkt na…</p>}
        <div ref={onder} />
      </div>

      <div className="border-t border-borderc p-3">
        {fout && <p className="mb-2 text-xs font-bold text-red-600">{fout}</p>}
        <form onSubmit={(e) => { e.preventDefault(); stuur(); }} className="flex items-end gap-2">
          <textarea
            value={tekst}
            onChange={(e) => setTekst(e.target.value.slice(0, MAX_LENGTE))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); stuur(); } }}
            rows={1}
            placeholder="Vraag je coach iets…"
            aria-label="Bericht aan je coach"
            className="max-h-32 min-h-[42px] min-w-0 flex-1 resize-none rounded-2xl border-2 border-borderc bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent sm:text-sm"
          />
          <button type="submit" disabled={denkt || !tekst.trim()} className="h-[42px] shrink-0 rounded-full bg-accent px-4 text-sm font-black text-brand disabled:opacity-40">Stuur</button>
        </form>
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink/50">
          <button type="button" onClick={() => setToonGeheugen((v) => !v)} className="font-bold underline">🧠 Wat onthoudt je coach? ({staat.feiten.length})</button>
          <button type="button" onClick={wis} className="font-bold underline">Gesprek wissen</button>
        </div>
        {toonGeheugen && (
          <ul className="mt-2 space-y-1 rounded-2xl bg-paper p-2 text-xs text-ink">
            {staat.feiten.length ? staat.feiten.map((f, i) => (
              <li key={`${i}-${f}`} className="flex items-start justify-between gap-2">
                <span className="min-w-0">{f}</span>
                <button type="button" onClick={() => vergeet(i)} aria-label={`Vergeet: ${f}`} className="shrink-0 font-bold text-ink/50">✕</button>
              </li>
            )) : <li className="text-ink-soft">Nog niets. Zeg "onthoud dat …" en het komt hier.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
