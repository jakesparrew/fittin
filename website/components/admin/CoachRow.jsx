import Link from "next/link";
import ActionForm from "@/components/ui/ActionForm";
import { setCoachPublic } from "@/app/beheer/actions";

// Eén coachrij, gedeeld door het roster en de fold "Slapend".
//
// WAAROM EEN RIJ EN GEEN KAART: de vorige pagina gaf elke coach een kaart van ~730 px met
// uitklapbalken. Daardoor stond er nooit meer dan één coach op het scherm en was vergelijken —
// precies waar je met zeven coaches naar kijkt — onmogelijk. Een rij van 56 px zet het hele team
// boven de vouw.
//
// Server-component: geen 'use client'. De enige interactie is de ●-schakelaar, en dat is een
// ActionForm die zichzelf meebrengt.

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const getal = (n) => String(n ?? 0).replace(".", ",");

// Hoe lang geleden was zijn laatste sessie? Boven de 30 dagen wordt het amber, boven de 60 rood —
// maar alleen voor iemand die ooit gedraaid heeft. Een coach die nog moet beginnen is niet "weg".
function Laatst({ dagen, ooit }) {
  if (dagen == null) return <span className="text-ink-soft/60">nooit</span>;
  const kleur = !ooit ? "text-ink-soft" : dagen > 60 ? "text-red-600" : dagen > 30 ? "text-amber-600" : "text-ink-soft";
  return <span className={`font-semibold ${kleur}`}>{dagen === 0 ? "vandaag" : `${dagen} d`}</span>;
}

export default function CoachRow({ coach, stats, saldo, schuld, betaaldCents, drukste, gedempt = false }) {
  const c = coach;
  const naam = c.full_name || c.email;
  // Balkje ten opzichte van de drukste coach. Dit IS de vergelijkingsgrafiek: hij staat precies
  // waar de beslissing valt, kost geen extra hoogte en blijft kloppen bij twintig coaches.
  const breedte = drukste > 0 ? Math.round((stats.sessies90 / drukste) * 100) : 0;
  const open = schuld.totaalCents > 0;

  return (
    <div className={"border-t border-borderc first:border-t-0 " + (gedempt ? "opacity-60" : "")}>
      <div className="grid items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-paper/60 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]">
        {/* Naam + zichtbaarheid */}
        <div className="flex min-w-0 items-center gap-2">
          <ActionForm action={setCoachPublic} success="Zichtbaarheid bijgewerkt ✓" className="shrink-0">
            <input type="hidden" name="coachId" value={c.id} />
            <input type="hidden" name="on" value={c.coach_public ? "0" : "1"} />
            <button
              title={c.coach_public ? "Staat op de website — klik om te verbergen" : "Niet op de website — klik om te tonen"}
              className={"flex h-6 w-6 items-center justify-center rounded-full text-xs transition " + (c.coach_public ? "bg-accent text-brand" : "bg-paper text-brand/35 hover:bg-brand/10")}
            >
              {c.coach_public ? "●" : "○"}
            </button>
          </ActionForm>
          <Link href={`/beheer/coaches/${c.id}`} className="min-w-0 flex-1">
            <span className="block truncate font-bold text-brand hover:text-accentdark">{naam}</span>
            <span className="block truncate text-xs text-ink-soft md:hidden">
              {stats.sessies90} sessies · laatst {stats.dagenGeleden == null ? "nooit" : `${stats.dagenGeleden} d`} · {stats.gepland} gepland · {getal(saldo)} beurten
            </span>
          </Link>
          {c.role === "beheerder" && <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-ink-soft">beheerder</span>}
          {c.is_test && <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-ink-soft">🧪 test</span>}
        </div>

        {/* Sessies 90 d + balkje */}
        <div className="hidden items-center gap-2 md:flex">
          <span className="w-6 shrink-0 text-right text-sm font-black tabular-nums text-brand">{stats.sessies90}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-borderc" aria-hidden>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${breedte}%` }} />
          </span>
        </div>

        <div className="hidden text-sm md:block"><Laatst dagen={stats.dagenGeleden} ooit={stats.totaal > 0} /></div>
        <div className="hidden text-sm tabular-nums text-ink-soft md:block">{stats.gepland}</div>
        <div className="hidden text-sm tabular-nums md:block">
          <span className={saldo < 0 ? "font-bold text-red-600" : "text-ink-soft"}>{getal(saldo)}</span>
        </div>
        <div className="hidden text-sm font-black tabular-nums text-brand md:block">{betaaldCents ? euro(betaaldCents) : <span className="font-normal text-ink-soft/60">—</span>}</div>

        <Link href={`/beheer/coaches/${c.id}`} className="hidden shrink-0 px-1 text-lg text-brand/30 transition hover:text-brand md:block" aria-label={`Open ${naam}`}>›</Link>

        {/* Openstaand: compacte chip, geen hero. Hetzelfde bedrag staat al als actiekaart op
            /beheer en volledig uitgewerkt op /beheer/financien; een derde kopie zou van deze
            pagina een doorgeefluik maken. */}
        {open && (
          <div className="col-span-full">
            <Link href={`/beheer/coaches/${c.id}`} className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 transition hover:bg-amber-200">
              Openstaand {euro(schuld.totaalCents)}
              <span className="font-semibold opacity-80">· afhandelen →</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
