import Image from "next/image";
import ActionForm from "@/components/ui/ActionForm";
import ProblemReply from "@/components/admin/ProblemReply";
import { bevestigMelding, zetZaalNotitie, losOpMelding } from "@/app/beheer/actions";
import { catLabel, catEmoji } from "@/lib/meldpunt";

// Eén melding, met de drie stappen die de lus sluiten: gezien → waarschuw de volgende → opgelost.
// Elke stap laat het lid iets weten. Dat is de hele reden dat iemand een tweede keer meldt.

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function MeldingKaart({ melding: r, fotoUrl, vorige }) {
  const gezien = !!r.acknowledged_at;
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-black text-brand">{catEmoji(r.category)} {catLabel(r.category)}</span>
            <span className="font-black text-brand">{r.member?.full_name || "Lid"}</span>
            <span className="text-xs font-semibold text-ink-soft">{fmt(r.created_at)}</span>
            {gezien && <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-accentdark">👀 gezien</span>}
          </p>
          {r.message && <p className="mt-2 text-sm leading-relaxed text-brand/80">{r.message}</p>}

          {/* Wie had het slot ervoor? ALLEEN hier zichtbaar — nooit voor andere leden. De huisregels
              zeggen "laat de zaal netjes achter voor de volgende", dus bij netheid is dit de vraag. */}
          {vorige && (
            <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
              Vorige gebruiker van de zaal: <strong className="text-brand">{vorige.naam}</strong> — {fmt(vorige.starts_at)}.
              <span className="block text-[11px] opacity-70">Alleen jij ziet dit.</span>
            </p>
          )}

          {fotoUrl && (
            <a href={fotoUrl} target="_blank" rel="noreferrer" className="mt-3 block w-fit overflow-hidden rounded-xl border border-borderc bg-white">
              <Image src={fotoUrl} alt="Foto bij de melding" width={220} height={165} className="h-auto w-[220px] object-cover" unoptimized />
            </a>
          )}

          {r.member?.email && <ProblemReply id={r.id} email={r.member.email} naam={r.member.full_name} />}
        </div>

        {!gezien && (
          <ActionForm action={bevestigMelding} success="Het lid weet dat je kijkt ✓" className="shrink-0">
            <input type="hidden" name="id" value={r.id} />
            <button className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-brand transition hover:bg-brand hover:text-white">👀 Ik kijk ernaar</button>
          </ActionForm>
        )}
      </div>

      <div className="mt-4 grid gap-3 border-t border-amber-200 pt-3 md:grid-cols-2">
        <ActionForm action={zetZaalNotitie} success="Bijgewerkt ✓">
          <input type="hidden" name="id" value={r.id} />
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-800">Waarschuw de volgende bezoekers</span>
          <div className="flex gap-2">
            <input
              name="public_note"
              defaultValue={r.public_note || ""}
              maxLength={200}
              placeholder="bv. de roeier staat buiten dienst"
              className="min-w-0 flex-1 rounded-lg border-2 border-amber-200 bg-white px-3 py-2 text-sm text-brand outline-none focus:border-amber-400"
            />
            <button className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-brand">Bewaar</button>
          </div>
          <span className="mt-1 block text-[11px] text-amber-800/80">Komt in de deurcodemail tot je de melding oplost.</span>
        </ActionForm>

        <ActionForm action={losOpMelding} success="Opgelost ✓">
          <input type="hidden" name="id" value={r.id} />
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-amber-800">Opgelost?</span>
          <div className="flex gap-2">
            <input
              name="resolved_note"
              maxLength={300}
              placeholder="bv. nieuwe kabel ligt erin"
              className="min-w-0 flex-1 rounded-lg border-2 border-amber-200 bg-white px-3 py-2 text-sm text-brand outline-none focus:border-amber-400"
            />
            <button className="shrink-0 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white">✓ Klaar</button>
          </div>
          <span className="mt-1 block text-[11px] text-amber-800/80">Het lid krijgt dit bericht te zien.</span>
        </ActionForm>
      </div>
    </div>
  );
}
