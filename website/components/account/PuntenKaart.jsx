import Link from "next/link";
import ActionForm from "@/components/ui/ActionForm";
import { wisselPuntenIn } from "@/app/(site)/account/punten-actions";
import ShareReferral from "@/components/ShareReferral";

const dagUur = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// De puntenkaart bovenaan /account. Een nieuw lid ziet enkel zijn startersopdracht — geen muur van nullen. Vanaf de
// derde sessie: niveau, saldo, weekdoel en wat er binnen bereik ligt.
export default function PuntenKaart({ o, compact = true }) {
  if (!o) return null;
  const { niveau, saldo, instellingen, reeks, week, quest, gestart, volgendeBadge, rustig, gymdoel, kanInwisselen } = o;
  const openQuest = quest.filter((q) => !q.gehaald);
  const pctSaldo = Math.min(100, Math.round((Math.max(0, saldo) / instellingen.prijs) * 100));

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-borderc bg-surface">
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lav">Fittin&rsquo; punten</p>
            <p className="mt-1 text-2xl font-black text-ink">
              {saldo} <span className="text-base font-bold text-ink/50">punten</span>
            </p>
            <p className="text-sm text-ink/60">
              Niveau <b className="text-ink">{niveau.naam}</b>
              {niveau.volgend && <> · nog {niveau.nogNodig} tot {niveau.volgend.naam}</>}
              {reeks >= 2 && <> · 🔥 {reeks} weken op rij</>}
            </p>
          </div>
          {kanInwisselen ? (
            <ActionForm action={wisselPuntenIn} success="Gratis sessie staat op je account ✓">
              <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand">🎁 Wissel in voor een gratis sessie</button>
            </ActionForm>
          ) : (
            <Link href="/account/punten" className="rounded-full border border-borderc px-4 py-2 text-sm font-bold text-ink hover:border-lav">Alles over je punten →</Link>
          )}
        </div>

        {/* Voortgang naar de gratis sessie — het concrete doel, niet het abstracte niveau. */}
        <div className="mt-4">
          <div className="h-2.5 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pctSaldo}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink/55">
            {kanInwisselen ? "Genoeg voor een gratis sessie!" : `Nog ${instellingen.prijs - Math.max(0, saldo)} punten tot een gratis sessie (${instellingen.prijs} = 1 sessie).`}
          </p>
        </div>

        {!gestart && openQuest.length > 0 && (
          <div className="mt-5 rounded-2xl bg-paper p-4">
            <p className="text-sm font-black text-ink">🚀 Je startersopdracht</p>
            <ul className="mt-2 space-y-1.5">
              {quest.map((q) => (
                <li key={q.id} className={"flex items-center justify-between gap-3 text-sm " + (q.gehaald ? "text-ink/40 line-through" : "text-ink")}>
                  <span>{q.gehaald ? "✓" : "○"} {q.l}</span>
                  <span className="shrink-0 text-xs font-bold text-accentdark">{q.gehaald ? "" : `+${q.waarde}`}</span>
                </li>
              ))}
            </ul>
            <Link href="/account/punten#profiel" className="mt-3 inline-block text-xs font-bold text-accentdark hover:underline">Profiel aanvullen →</Link>
          </div>
        )}

        {gestart && (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-paper p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-lav">Deze week</p>
              <p className="mt-1 text-lg" aria-label={`${week.gedaan} van ${week.doel} sessies`}>
                {Array.from({ length: week.doel }, (_, i) => (i < week.gedaan ? "●" : "○")).join(" ")}
              </p>
              <p className="text-xs text-ink/55">{week.gedaan >= week.doel ? "Weekdoel gehaald ✓" : `${week.doel - week.gedaan} te gaan (+5)`}</p>
            </div>
            <div className="rounded-2xl bg-paper p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-lav">Volgende badge</p>
              {volgendeBadge ? (
                <>
                  <p className="mt-1 text-sm font-bold text-ink">{volgendeBadge.badge.e} {volgendeBadge.badge.l}</p>
                  <p className="text-xs text-ink/55">nog {volgendeBadge.nog} {volgendeBadge.wat}</p>
                </>
              ) : <p className="mt-1 text-sm text-ink/55">Alles binnen bereik behaald 🏅</p>}
            </div>
            <div className="rounded-2xl bg-paper p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-lav">Gymdoel deze maand</p>
              <p className="mt-1 text-sm font-bold text-ink">{gymdoel.gedaan} / {gymdoel.doel} sessies</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((gymdoel.gedaan / gymdoel.doel) * 100))}%` }} />
              </div>
            </div>
          </div>
        )}

        {instellingen.rustigAan && rustig.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-ink">⚡ Rustig deze week:</span>
            {rustig.map((m) => (
              <Link key={m.iso} href="/boeken?rustig=1" className="rounded-full bg-accent/15 px-2.5 py-1 font-bold text-ink hover:bg-accent/25">{dagUur.format(new Date(m.iso))}</Link>
            ))}
            <span className="text-ink/50">dubbele punten · 2 uur voor de prijs van 1</span>
          </div>
        )}
      </div>
      {/* Snel punten verdienen: de acties die het meest opleveren, elk met een knop die er meteen naartoe gaat. */}
      <div className="border-t border-borderc px-5 py-4 md:px-6">
        <p className="text-xs font-bold uppercase tracking-widest text-lav">Snel punten verdienen</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-accent/10 p-3 sm:col-span-2">
            <p className="text-sm font-black text-ink">👋 Nodig een vriend uit — tot +270 punten</p>
            <p className="mt-0.5 text-xs text-ink/60">+20 als die een account maakt, +100 bij hun eerste betaalde sessie, +150 als ze klant worden. Hun eerste uur is gratis.</p>
            <div className="mt-2"><ShareReferral code={o.referralCode} compact /></div>
          </div>
          <Link href="/boeken?rustig=1" className="rounded-2xl bg-paper p-3 transition hover:bg-accent/10">
            <p className="text-sm font-black text-ink">⚡ Boek een rustig uur →</p>
            <p className="text-xs text-ink/60">Dubbele punten, en 2 uur voor de prijs van 1</p>
          </Link>
          <Link href="/boeken" className="rounded-2xl bg-paper p-3 transition hover:bg-accent/10">
            <p className="text-sm font-black text-ink">👥 Train met z&rsquo;n tweeën →</p>
            <p className="text-xs text-ink/60">Zet je gast erbij: +5 als die &ldquo;Ik kom&rdquo; tikt</p>
          </Link>
          <Link href="/training" className="rounded-2xl bg-paper p-3 transition hover:bg-accent/10">
            <p className="text-sm font-black text-ink">📝 Log je training →</p>
            <p className="text-xs text-ink/60">+3 per dag dat je logt</p>
          </Link>
          <div className="rounded-2xl bg-paper p-3">
            <p className="text-sm font-black text-ink">🧼 Zaalcheck</p>
            <p className="text-xs text-ink/60">Eén tik in je deurcodemail bij het binnenkomen: +3</p>
          </div>
        </div>
      </div>
      {compact && (
        <Link href="/account/punten" className="block border-t border-borderc bg-paper/60 px-5 py-2.5 text-center text-xs font-bold text-ink/60 hover:text-ink">
          Hoe verdien ik punten? · Mijn badges · Geschiedenis →
        </Link>
      )}
    </section>
  );
}
