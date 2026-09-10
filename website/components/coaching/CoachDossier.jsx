import Link from "next/link";

// Het AI-dossier zoals een échte coach het ziet: het verloop, niet de rauwe data.
//
// Wat er bewust NIET in staat: het weekmenu (voeding is gevoeliger dan een schema — zie 0158), en
// het gewicht en de leeftijd van het lid. Een coach die dat wil weten, vraagt het. Dit scherm is
// er om te zien waar iemand vastloopt vóór het gesprek, niet om een dossier te vervangen.

const ZWAARTE = { te_licht: "te licht", goed: "goed", te_zwaar: "te zwaar" };
const VERLOOP = { vlot: "vlot", wisselend: "wisselend", moeilijk: "moeilijk" };
const ENERGIE = { goed: "goede energie", ok: "oké energie", laag: "lage energie" };

export default function CoachDossier({ dossier }) {
  const { plan, weken, checkins } = dossier || {};
  if (!plan) return null;

  const perWeek = new Map((checkins || []).map((c) => [c.week_id, c]));
  const open = [...(weken || [])].reverse().find((w) => w.unlocked_at && !w.completed_at);
  const gehad = (weken || []).filter((w) => w.unlocked_at).reverse();

  return (
    <section className="mt-8 rounded-3xl border border-borderc bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-black text-brand">AI-coach</h2>
        <span className="text-xs text-brand/45">
          {plan.status === "lopend" ? `week ${open?.weeknummer || "?"} van ${plan.weken}` : plan.status} · doel: {plan.doel}
        </span>
      </div>

      {plan.doorverwezen_at && (
        <div className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-black text-brand">De AI-coach verwees door naar jou</p>
          <p className="mt-1 text-sm text-brand/70">
            {plan.doorverwijs_reden || "meerdere weken te zwaar"} — het lid zag een uitnodiging voor een gratis intake.
          </p>
        </div>
      )}

      {plan.samenvatting && <p className="mt-3 text-sm leading-relaxed text-brand/75">{plan.samenvatting}</p>}

      {!gehad.length ? (
        <p className="mt-3 text-sm text-brand/50">Er staat nog geen week open.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {gehad.slice(0, 8).map((w) => {
            const c = perWeek.get(w.id);
            return (
              <li key={w.id} className="border-l-2 border-borderc pl-4">
                <p className="text-xs font-bold uppercase tracking-wide text-brand/40">
                  Week {w.weeknummer}
                  {w.is_rustweek ? " · lichtere week" : ""}
                  {w.besluit ? ` · ${w.besluit}` : ""}
                </p>
                {w.weekanalyse && <p className="mt-1 text-sm leading-relaxed text-brand/75">{w.weekanalyse}</p>}
                {c && (
                  <p className="mt-1 text-xs text-brand/50">
                    Check-in: {[ZWAARTE[c.zwaarte], VERLOOP[c.verloop], ENERGIE[c.energie]].filter(Boolean).join(" · ") || "ingevuld"}
                    {c.pijn ? ` · pijn${c.pijn_waar ? ` (${c.pijn_waar})` : ""}` : ""}
                  </p>
                )}
                {c?.vrij && <p className="mt-1 text-xs italic text-brand/55">&ldquo;{c.vrij}&rdquo;</p>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-brand/40">
        Dit dossier is van het lid. Het weekmenu staat er bewust niet in.{" "}
        <Link href="/privacy" className="underline">Waarom</Link>.
      </p>
    </section>
  );
}
