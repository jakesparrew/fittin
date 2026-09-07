"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Een grap voor precies één persoon: de eigenaar. /beheer is superadmin-only (app/beheer/layout.jsx
// stuurt elke andere rol weg), en er is op dit moment maar één beheerder. Coaches en leden krijgen
// dit dus nooit te zien — dat is geen instelling maar een gevolg van waar dit component hangt.
// lib/factuurgrap.test.js bewaakt dat het daar blijft hangen.
//
// Waarom er een ontknoping in zit: de tekst beweert dat de site over 72 uur offline gaat, en dat is
// verzonnen. Eén klik verder staat de clou, zodat de schrik tien seconden duurt in plaats van een
// telefoontje naar Vercel. Wil je hem meteen tonen: METEEN_DE_CLOU op true.
// Alles uitzetten: GRAP_AAN op false. Eén regel, geen andere gevolgen.

const GRAP_AAN = true;
const METEEN_DE_CLOU = false;

// Waar de grap NOOIT verschijnt. Een verzonnen betalingsalarm hoort niet in beeld op het moment dat
// er met echt geld of met een echte klant gewerkt wordt: /beheer/factuur is een document dat naar
// een klant vertrekt (en dat je over je schouder laat meelezen), /beheer/financien is het scherm
// waar echte betalingen en terugbetalingen staan. Daar zou een valse aanmaning niet grappig zijn
// maar verwarrend — en op een screenshot naar een klant ronduit schadelijk.
// Wil je hem toch overal: maak deze lijst leeg.
const NIET_HIER = ["/beheer/factuur", "/beheer/financien"];

// Vaste deadline, bewust een constante: een afteller die zichzelf telkens opnieuw op 72 uur zet, is
// nooit verlopen en dus nooit geloofwaardig. Verstrijkt deze, dan verandert alleen de tekst — er
// gebeurt niets, er wordt niets geblokkeerd, er vertrekt geen mail.
const DEADLINE = Date.parse("2026-09-10T09:00:00+02:00");

// Twee onbetaalde maandfacturen van 90 euro. Bewust echte bedragen: een verzonnen 7.000 euro is
// meteen ongeloofwaardig én zou een echte schrik geven over geld dat niet bestaat. 180 euro is wat
// er werkelijk openstaat, en dat is precies de bedoeling van de melding.
const OPENSTAANDE_FACTUREN = [
  { naam: "Maandfactuur juli 2026", ref: "SDS-2026-07", bedrag: "€ 90,00" },
  { naam: "Maandfactuur augustus 2026", ref: "SDS-2026-08", bedrag: "€ 90,00" },
];
const AANTAL_FACTUREN = OPENSTAANDE_FACTUREN.length;
const TOTAAL_BEDRAG = "€ 180,00";

// Enkel namen, bewust géén logo's en géén overheidsinstanties. Een verzonnen aanmaning met het merk
// of het wapenschild van een echte partij erop is geen grap meer maar een nabootsing — en met FOD
// Financiën of Stad Gent erbij lijkt het op de valse schuldbrieven die in België echt rondgaan.
// Namen in een leveranciersrij zijn wat een facturatiesysteem sowieso toont.
const LEVERANCIERS = ["Stripe Payments", "Bancontact", "Neon Database", "Vercel Hosting", "Resend Email", "DNS Belgium", "YUKI"];

// De lopende tekst staat in constanten en niet los in de JSX: zo kan een apostrof of een aanhaling
// nooit de lint-regel react/no-unescaped-entities laten vallen, en die is hier een deploy-poort.
const TEKST = {
  kicker: "Geautomatiseerde melding · Leveranciersfacturatie",
  referentie: "Ref. FTTN-2026-1180",
  titel: "Betalingsachterstand — dienst wordt opgeschort",
  intro:
    "Er staan twee maandfacturen open. Zolang die niet voldaan zijn, worden de diensten waarop dit platform draait na het verstrijken van de termijn opgeschort.",
  dekt: "Deze facturen dekken de diensten van:",
  gevolg:
    "Na het verstrijken: fittin.be is niet langer bereikbaar, betalingen worden geweigerd en er vertrekken geen e-mails meer.",
  voet: "Dit bericht is automatisch gegenereerd. Beantwoorden is niet mogelijk.",
  clouTitel: "Grapje.",
  clouEen:
    "Er staat geen enkele factuur open bij Stripe, Vercel of Resend. Fittin draait trouwens op Supabase en niet op Neon — dat had het kunnen verraden. Niemand schort iets op, en de site blijft gewoon online.",
  clouTwee:
    "Wat wel klopt: er staan twee maandfacturen van Sidestream open, samen 180 euro. Betaal je die op tijd, dan hoef je dit scherm nooit meer te zien.",
};

const SLEUTEL = "fittin:factuurgrap";

// localStorage kan gooien (privémodus, geblokkeerde site-data). Een grap mag nooit de reden zijn dat
// het beheer een fout logt — ErrorLogger stuurt daar een alarmmail over.
const lees = () => { try { return window.localStorage.getItem(SLEUTEL); } catch { return null; } };
const schrijf = (v) => { try { window.localStorage.setItem(SLEUTEL, v); } catch { /* mag mislukken */ } };
const vandaag = () => new Date().toISOString().slice(0, 10);

const tweeCijfers = (n) => String(n).padStart(2, "0");
const klok = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${tweeCijfers(Math.floor(s / 3600))}:${tweeCijfers(Math.floor((s % 3600) / 60))}:${tweeCijfers(s % 60)}`;
};

export default function FactuurHerinneringGrap() {
  // De klok wordt PAS na hydratatie gelezen. Een teller of een grens die tijdens het renderen uit
  // Date.now() komt, geeft React-fout #418 en legt de hele pagina plat — dat is in dit project al
  // 46 keer gebeurd. lib/hydration-clock.test.js scant hierop. Server en browser renderen allebei
  // eerst "--:--:--"; pas daarna begint het te lopen.
  const [nu, setNu] = useState(null);
  const [open, setOpen] = useState(false);
  const [clou, setClou] = useState(METEEN_DE_CLOU);
  const [balkWeg, setBalkWeg] = useState(false);

  const pad = usePathname() || "";
  const stil = !GRAP_AAN || NIET_HIER.some((p) => pad.startsWith(p));

  useEffect(() => {
    setNu(Date.now());
    const t = setInterval(() => setNu(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Hoogstens één keer per dag vanzelf openen. Wie hem al gezien heeft, wordt niet bij elk
  // paginabezoek opnieuw opgeschrikt — anders wordt het meubilair en werkt het niet meer.
  // Op een stille pagina niets doen én niets wegschrijven: anders zou een bezoek aan de
  // facturatiepagina de grap voor de rest van de dag opgebruiken zonder ze te tonen.
  useEffect(() => {
    if (stil) return;
    if (lees() === vandaag()) { setBalkWeg(true); return; }
    setOpen(true);
  }, [stil]);

  // Escape sluit. Een overlay zonder uitweg is geen grap meer.
  useEffect(() => {
    if (!open) return undefined;
    const opToets = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      schrijf(vandaag());
    };
    window.addEventListener("keydown", opToets);
    return () => window.removeEventListener("keydown", opToets);
  }, [open]);

  function sluit() {
    setOpen(false);
    schrijf(vandaag());
  }

  if (stil) return null;

  const rest = nu === null ? null : DEADLINE - nu;
  const verlopen = rest !== null && rest <= 0;
  const teller = rest === null ? "--:--:--" : klok(rest);

  return (
    <>
      {!balkWeg && (
        // print:hidden — /beheer/factuur is een printpagina. Zonder dit staat de melding straks op
        // een factuur die naar een echte klant vertrekt.
        <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden md:px-6">
          {/* De tekst wrapt op een telefoon; het kruisje staat daarbuiten en blijft dus rechtsboven
              op één regel staan. Stond het in dezelfde wrap-rij, dan zakte het naar een derde regel
              en werd de balk onnodig hoog. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span aria-hidden="true">⚠️</span>
            <span className="font-bold">
              {verlopen ? "Betalingstermijn verstreken" : `${AANTAL_FACTUREN} openstaande facturen · ${TOTAAL_BEDRAG}`}
            </span>
            <span className="text-red-700/80">
              {verlopen ? "· wacht op betaling Sidestream" : "· dienstonderbreking over"}
            </span>
            {/* tabular-nums: anders springt de balk elke seconde een paar pixels breder. */}
            {!verlopen && <span className="font-mono font-bold tabular-nums">{teller}</span>}
            <button
              type="button"
              onClick={() => { setOpen(true); setClou(METEEN_DE_CLOU); }}
              className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-700"
            >
              Bekijken
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setBalkWeg(true); schrijf(vandaag()); }}
            aria-label="Verberg deze melding"
            className="shrink-0 rounded-full px-2 py-1 text-red-700/60 transition hover:bg-red-100 hover:text-red-900"
          >
            ✕
          </button>
        </div>
      )}

      {open && (
        // z-[90] blijft bewust ONDER de toasts (z-[100]): een echte melding over een echte actie
        // hoort nooit achter een grap te verdwijnen.
        <div
          className="anim-fade fixed inset-0 z-[90] flex items-end justify-center bg-brand/60 p-4 backdrop-blur-sm print:hidden sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={clou ? TEKST.clouTitel : TEKST.titel}
          onClick={sluit}
        >
          <div
            className="anim-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {!clou ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-600">{TEKST.kicker}</p>
                  <p className="shrink-0 font-mono text-[10px] text-brand/40">{TEKST.referentie}</p>
                </div>
                <h2 className="mt-2 font-display text-2xl font-black leading-tight text-brand">{TEKST.titel}</h2>
                <p className="mt-3 text-sm leading-relaxed text-brand/70">{TEKST.intro}</p>

                <div className="mt-5 overflow-hidden rounded-2xl border border-borderc">
                  {OPENSTAANDE_FACTUREN.map((f) => (
                    <div key={f.ref} className="flex items-center justify-between gap-3 border-b border-borderc px-4 py-2.5 text-sm last:border-b-0">
                      <span className="min-w-0 truncate font-bold text-brand">{f.naam}</span>
                      <span className="shrink-0 font-mono text-[11px] text-brand/40">{f.ref}</span>
                      <span className="shrink-0 font-mono tabular-nums text-brand">{f.bedrag}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 bg-paper px-4 py-2.5 text-sm">
                    <span className="font-black text-brand">Totaal</span>
                    <span className="shrink-0 font-mono font-black tabular-nums text-brand">{TOTAAL_BEDRAG}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-brand/45">{TEKST.dekt}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {LEVERANCIERS.map((n) => (
                    <span key={n} className="rounded-md border border-borderc px-2 py-0.5 font-mono text-[10px] text-brand/50">
                      {n}
                    </span>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-red-50 p-4 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-700/70">
                    {verlopen ? "Termijn verstreken" : "Resterende termijn"}
                  </p>
                  <p className="mt-1 font-mono text-3xl font-black tabular-nums text-red-700">
                    {verlopen ? "00:00:00" : teller}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-red-800/80">{TEKST.gevolg}</p>
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={() => setClou(true)}
                    className="rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 sm:flex-1"
                  >
                    Betaal nu — {TOTAAL_BEDRAG}
                  </button>
                  <button
                    type="button"
                    onClick={sluit}
                    className="rounded-full border-2 border-borderc px-5 py-3 text-sm font-bold text-brand transition hover:border-lav"
                  >
                    Later
                  </button>
                </div>
                <p className="mt-4 text-center text-[11px] text-brand/35">{TEKST.voet}</p>
              </>
            ) : (
              <>
                <p className="text-4xl" aria-hidden="true">🎉</p>
                <h2 className="mt-2 font-display text-2xl font-black leading-tight text-brand">{TEKST.clouTitel}</h2>
                <p className="mt-3 text-sm leading-relaxed text-brand/70">{TEKST.clouEen}</p>
                <p className="mt-3 text-sm leading-relaxed text-brand/70">{TEKST.clouTwee}</p>
                <button
                  type="button"
                  onClick={sluit}
                  className="mt-6 w-full rounded-full bg-accent px-5 py-3 text-sm font-bold text-brand transition hover:opacity-90"
                >
                  Oké, begrepen
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
