"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { coachCreateProgram } from "@/app/coach/coaching-actions";

// Een nieuw programma aanmaken, één vraag per scherm.
//
// Hiervoor stonden drie beslissingen naast elkaar in één balk: naam, "Startpunt" en "Direct
// toewijzen aan (optioneel)" met als standaardwaarde "— Template (niemand) —". Dat laatste is
// jargon: een coach die voor het eerst een schema maakt, weet niet wat een template is, of hij er
// een wil, of wat er gebeurt als hij het meteen aan iemand toewijst. De balk vroeg dus drie keer
// iets zonder één keer uit te leggen waarom.
//
// Nu: drie schermen, elk met de vraag groot en het waarom eronder. Kiezen gaat vooruit, Enter gaat
// vooruit, en de laatste stap vat samen wat er gaat gebeuren voor je bevestigt.

const STARTPUNTEN = [
  {
    v: "",
    titel: "Leeg beginnen",
    kort: "1 dag",
    uitleg: "Je start met één lege dag en bouwt zelf op. Dagen bijmaken kan altijd.",
  },
  {
    v: "full_body_3",
    titel: "Full body",
    kort: "3 dagen",
    uitleg: "Elke training het hele lichaam. De veiligste keuze voor beginners en voor wie drie keer per week traint.",
  },
  {
    v: "ppl_3",
    titel: "Push / Pull / Benen",
    kort: "3 dagen",
    uitleg: "Duwen, trekken, benen. De klassieke opdeling zodra iemand wat ervaring heeft.",
  },
  {
    v: "upper_lower_4",
    titel: "Upper / Lower",
    kort: "4 dagen",
    uitleg: "Twee keer bovenlichaam, twee keer onderlichaam. Voor wie vier keer per week traint.",
  },
];

const VOORBEELDEN = ["Full body — 3x/week", "Push/Pull/Benen", "Kracht — 4x/week", "Herstel & mobiliteit"];

export default function NieuwProgramma({ clients = [] }) {
  const [open, setOpen] = useState(false);
  const [stap, setStap] = useState(1);
  const [naam, setNaam] = useState("");
  // null, niet "": met een lege string was "Leeg beginnen" al groen aangevinkt bij binnenkomst,
  // alsof je die keuze al gemaakt had. Bij een Typeform-achtige vraag hoort niets voorgeselecteerd.
  const [preset, setPreset] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [fout, setFout] = useState(null);
  const [pending, start] = useTransition();
  const naamRef = useRef(null);

  const totaal = 3;
  const startpunt = STARTPUNTEN.find((s) => s.v === preset);
  const client = clients.find((c) => c.id === memberId);

  useEffect(() => {
    if (open && stap === 1) naamRef.current?.focus();
  }, [open, stap]);

  // Escape sluit, maar alleen vanaf de eerste stap — anders verlies je halverwege je antwoorden
  // met één toets. Vanaf stap 2 gaat Escape één stap terug.
  useEffect(() => {
    if (!open) return;
    const opToets = (e) => {
      if (e.key !== "Escape") return;
      if (stap > 1) setStap((s) => s - 1);
      else sluit();
    };
    window.addEventListener("keydown", opToets);
    return () => window.removeEventListener("keydown", opToets);
  }, [open, stap]);

  // Ook hier null: anders staat "Leeg beginnen" bij de tweede keer openen wél voorgeselecteerd.
  const sluit = () => { setOpen(false); setStap(1); setNaam(""); setPreset(null); setMemberId(""); setFout(null); };

  const maak = () => {
    setFout(null);
    const fd = new FormData();
    fd.set("name", naam.trim());
    fd.set("preset", preset || "");
    fd.set("memberId", memberId);
    start(async () => {
      // coachCreateProgram stuurt bij succes door naar de nieuwe bouwer (redirect gooit intern),
      // dus hier komen we alleen terug als er écht iets misging.
      const res = await coachCreateProgram(fd);
      if (res?.error) setFout(res.error);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-2xl bg-accent px-6 py-4 text-lg font-black text-brand transition hover:opacity-90 sm:w-auto sm:px-8"
      >
        + Nieuw programma
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Nieuw programma">
      {/* Kop: terug, voortgang, sluiten. */}
      <div className="flex items-center gap-3 border-b border-borderc px-4 py-3">
        <button
          type="button"
          onClick={() => (stap > 1 ? setStap(stap - 1) : sluit())}
          aria-label={stap > 1 ? "Vorige vraag" : "Sluiten"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-brand/50 transition hover:bg-paper hover:text-brand"
        >
          {stap > 1 ? "←" : "✕"}
        </button>
        <div className="flex flex-1 items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <span key={n} className={"h-1.5 flex-1 rounded-full transition " + (n <= stap ? "bg-accent" : "bg-borderc")} />
          ))}
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-ink-soft">{stap} / {totaal}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto max-w-lg">
          {stap === 1 && (
            <>
              <Vraag
                nr="Vraag 1"
                titel="Hoe noem je dit schema?"
                uitleg="Je client ziet deze naam bovenaan onder “Training”. Kies iets waaraan hij het herkent — niet “Programma 1”."
              />
              <input
                ref={naamRef}
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && naam.trim()) { e.preventDefault(); setStap(2); } }}
                placeholder="bv. Full body — 3x/week"
                maxLength={80}
                className="mt-7 w-full border-0 border-b-2 border-borderc pb-3 text-2xl font-black text-brand outline-none transition placeholder:font-normal placeholder:text-brand/25 focus:border-accent"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {VOORBEELDEN.map((v) => (
                  <button key={v} type="button" onClick={() => setNaam(v)} className="rounded-full border-2 border-borderc px-3.5 py-1.5 text-sm font-bold text-ink-soft transition hover:border-lav hover:text-brand">
                    {v}
                  </button>
                ))}
              </div>
              <Volgende aan={!!naam.trim()} op={() => setStap(2)} />
            </>
          )}

          {stap === 2 && (
            <>
              <Vraag
                nr="Vraag 2"
                titel="Waarmee wil je starten?"
                uitleg="Dit zet alleen de dagen alvast klaar — de oefeningen kies je zelf in de volgende stap. Je kan dagen later nog bijmaken, hernoemen of dupliceren."
              />
              <div className="mt-6 space-y-3">
                {STARTPUNTEN.map((s) => (
                  <button
                    key={s.v || "leeg"}
                    type="button"
                    onClick={() => { setPreset(s.v); setStap(3); }}
                    className={
                      "block w-full rounded-2xl border-2 p-4 text-left transition " +
                      (preset === s.v ? "border-accent bg-accent/5" : "border-borderc hover:border-lav")
                    }
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-black text-brand">{s.titel}</span>
                      <span className="shrink-0 rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-ink-soft">{s.kort}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{s.uitleg}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {stap === 3 && (
            <>
              <Vraag
                nr="Vraag 3"
                titel="Voor wie is dit schema?"
                uitleg="Je kan het eerst rustig afwerken en later toewijzen, of het meteen aan een client geven."
              />
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setMemberId("")}
                  className={"block w-full rounded-2xl border-2 p-4 text-left transition " + (memberId === "" ? "border-accent bg-accent/5" : "border-borderc hover:border-lav")}
                >
                  <span className="block font-black text-brand">Nog voor niemand — een sjabloon</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
                    Je bouwt het eerst af. Eén sjabloon kan je daarna aan meerdere clienten geven; elk krijgt zijn eigen kopie, dus jouw sjabloon blijft ongewijzigd.
                  </span>
                </button>

                {clients.length === 0 ? (
                  <p className="rounded-2xl bg-paper p-4 text-sm leading-relaxed text-ink-soft">
                    Je hebt nog geen clienten. Zodra een lid met jou verbonden is, kan je een schema rechtstreeks toewijzen.
                  </p>
                ) : (
                  <div className="rounded-2xl border-2 border-borderc p-4">
                    <p className="font-black text-brand">Meteen aan een client</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                      Hij ziet het onmiddellijk onder “Training” en krijgt een melding. Kies dit als het schema al af is.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {clients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setMemberId(c.id)}
                          className={
                            "rounded-full border-2 px-4 py-2 text-sm font-bold transition " +
                            (memberId === c.id ? "border-accent bg-accent/10 text-brand" : "border-borderc text-ink-soft hover:border-lav hover:text-brand")
                          }
                        >
                          {c.full_name || c.email}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Samenvatting: wat gaat er precies gebeuren als je nu bevestigt. */}
              <div className="mt-6 rounded-2xl bg-paper p-4 text-sm leading-relaxed text-brand">
                <p className="font-bold">Je maakt aan:</p>
                <p className="mt-1 text-ink-soft">
                  <strong className="text-brand">{naam.trim() || "Naamloos"}</strong> — {startpunt?.titel.toLowerCase() || "leeg"} ({startpunt?.kort || "1 dag"}),{" "}
                  {client ? <>meteen voor <strong className="text-brand">{client.full_name || client.email}</strong></> : "nog niet toegewezen"}.
                </p>
              </div>

              {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

              <button
                type="button"
                disabled={pending || !naam.trim()}
                onClick={maak}
                className="mt-6 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Bezig…" : "Programma aanmaken →"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Vraag({ nr, titel, uitleg }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accentdark">{nr}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-brand sm:text-3xl">{titel}</h2>
      <p className="mt-3 text-base leading-relaxed text-ink-soft">{uitleg}</p>
    </>
  );
}

function Volgende({ aan, op }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <button
        type="button"
        disabled={!aan}
        onClick={op}
        className="rounded-full bg-accent px-8 py-3.5 font-black text-brand transition hover:opacity-90 disabled:opacity-40"
      >
        Volgende →
      </button>
      <span className="text-sm text-ink-soft">of druk op Enter</span>
    </div>
  );
}
