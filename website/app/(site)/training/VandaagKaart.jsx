import Link from "next/link";

// De startkaart bovenaan /training. Eén vraag beantwoorden: wat doe ik nu?
//
// Vóór deze kaart stonden alle trainingsdagen tegelijk uitgeklapt, ónder het chatvenster en het
// voortgangspaneel — een lid scrolde honderden pixels voor hij zijn eerste oefening zag, en de app
// zei nergens welke dag aan de beurt was. Die keuze wordt nu afgeleid uit wat je het laatst logde
// (lib/training-dagen.js) en staat bovenaan, met één knop over de volle breedte.
export default function VandaagKaart({ dag, dagen, minuten, klaar }) {
  if (!dag) return null;
  const totaal = dag.exercises.length;
  const bezig = klaar > 0 && klaar < totaal;
  const af = totaal > 0 && klaar === totaal;

  return (
    <section className="mt-8 overflow-hidden rounded-3xl bg-brand text-white">
      <div className="p-6 md:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">
          {af ? "Vandaag afgewerkt" : bezig ? "Verder waar je stopte" : "Vandaag"}
        </p>
        <h2 className="mt-1.5 text-2xl font-black md:text-3xl">{dag.name || `Dag ${dag.day_no}`}</h2>
        <p className="mt-1 text-sm text-lav">
          {totaal} {totaal === 1 ? "oefening" : "oefeningen"} · ± {minuten} min
          {bezig ? ` · ${klaar} al gedaan` : ""}
        </p>

        <Link
          href={`/training/sessie?dag=${dag.id}`}
          className="mt-5 block rounded-full bg-accent py-4 text-center text-lg font-black text-brand transition hover:opacity-90"
        >
          {af ? "Sessie opnieuw openen" : bezig ? "Verder trainen →" : "Start training →"}
        </Link>

        {af && (
          <p className="mt-3 text-center text-sm text-lav">
            Alles afgevinkt. Morgen staat <strong className="text-white">{volgendeNaam(dagen, dag)}</strong> klaar.
          </p>
        )}
      </div>

      {dagen.length > 1 && (
        <div className="border-t border-white/10 px-6 py-4 md:px-7">
          <p className="text-[11px] font-bold uppercase tracking-widest text-lav">Andere dag kiezen</p>
          {/* Horizontaal scrollen i.p.v. wrappen: bij zes dagen groeit de kaart anders drie rijen
              hoog en duwt ze de startknop weg — precies wat we hier oplossen. */}
          <div className="-mx-6 mt-2 flex gap-2 overflow-x-auto px-6 pb-1 md:-mx-7 md:px-7">
            {dagen.map((d) => (
              <Link
                key={d.id}
                href={`/training/sessie?dag=${d.id}`}
                className={
                  "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition " +
                  (d.id === dag.id ? "bg-white text-brand" : "bg-white/10 text-white hover:bg-white/20")
                }
              >
                {d.name || `Dag ${d.day_no}`}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function volgendeNaam(dagen, huidige) {
  if (!dagen.length) return "je volgende dag";
  const i = dagen.findIndex((d) => d.id === huidige.id);
  const v = dagen[(i + 1) % dagen.length];
  return v.name || `Dag ${v.day_no}`;
}
