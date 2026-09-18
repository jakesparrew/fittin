import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { puntenOverzicht, DOEL_OPTIES, BRON_OPTIES } from "@/lib/punten-overzicht";
import { soortLabel, NIVEAUS, PERK_PCT } from "@/lib/punten";
import PuntenKaart from "@/components/account/PuntenKaart";
import ActionForm from "@/components/ui/ActionForm";
import { bewaarPuntenProfiel, bewaarHoeGevonden } from "../punten-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn punten | Fittin'" };

const datum = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" });

// Wat levert wat op — de tabel die leden zien. Leest de waarden van de gym (instellingen), niet vast.
// [sleutel, wat, extra, knop-link, knop-tekst] — elke manier om punten te verdienen met een knop die er meteen heen gaat.
const VERDIENEN = [
  ["sessie", "Een sessie die je trainde (telt na afloop)", "× 2 op een rustig uur ⚡", "/boeken", "Boek"],
  ["week", "Een week waarin je je weekdoel haalt", "", "#profiel", "Weekdoel"],
  ["reeks4", "Elke 4 weken op rij", "1 pauzeweek per 2 maanden", "/boeken", "Boek"],
  ["zaalcheck", "Zaalcheck bij het binnenkomen", "in je deurcodemail · +2 met een foto", null, null],
  ["rating", "Je sessie beoordelen", "in de mail na je sessie", null, null],
  ["netjes", "“Ik heb alles teruggelegd”", "in de mail na je sessie", null, null],
  ["log", "Je training loggen", "max. 1 per dag", "/training", "Loggen"],
  ["gewicht", "Je gewicht bijhouden", "max. 1 per week", "/account#gewicht", "Invullen"],
  ["gast_bevestigd", "Je gast bevestigt dat hij meekomt", "zet gasten bij je boeking", "/account#sessies", "Gast toevoegen"],
  ["deelnemer", "Meetrainen als gast (na “Ik kom”)", "", null, null],
  ["gast_account", "Een vriend maakt een account via jou", "", "/community", "Nodig uit"],
  ["vriend_eerste", "Die vriend traint voor het eerst (betaald)", "die krijgt er zelf 25", "/community", "Nodig uit"],
  ["vriend_abo", "Die vriend neemt een abonnement of kaart", "", "/community", "Nodig uit"],
  ["abo_start", "Je start een abonnement", "één keer", "/lidmaatschap", "Bekijk"],
  ["abo_maand", "Elke betaalde abonnementsmaand", "", "/lidmaatschap", "Bekijk"],
  ["kaart", "Een beurtenkaart kopen", "", "/lidmaatschap", "Bekijk"],
  ["coach_checkin", "AI-coach: wekelijkse check-in", "", "/coaching", "Naar coach"],
  ["coach_mijlpaal", "AI-coach: mijlpaal gehaald", "", "/coaching", "Naar coach"],
];

export default async function MijnPunten() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/punten");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("gym_id, role").eq("id", user.id).maybeSingle();
  const o = prof ? await puntenOverzicht(admin, user.id, prof.gym_id) : null;

  if (!o) {
    return (
      <main className="bg-paper">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <Link href="/account" className="text-sm font-semibold text-ink/50 hover:text-ink">← Mijn account</Link>
          <h1 className="mt-3 text-3xl font-black text-ink">Fittin&rsquo; punten</h1>
          <p className="mt-2 text-ink/60">{prof && prof.role !== "lid" ? "Punten zijn er voor leden — coaches en beheerders sparen niet mee." : "Punten staan momenteel uit."}</p>
        </div>
      </main>
    );
  }
  const w = o.instellingen.waarden;

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/account" className="text-sm font-semibold text-ink/50 hover:text-ink">← Mijn account</Link>
        <h1 className="mt-3 text-3xl font-black text-ink">Fittin&rsquo; punten</h1>
        <p className="mt-2 text-sm text-ink/60">
          Je verdient punten door te trainen en mee te bouwen aan de gym. <b className="text-ink">{o.instellingen.prijs} punten = een gratis sessie.</b> Inwisselen
          verlaagt je niveau nooit — dat telt alles wat je ooit verdiende.
        </p>
        <div className="mt-6"><PuntenKaart o={o} compact={false} /></div>

        <section id="profiel" className="rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Je doel en weekdoel</h2>
          <p className="mt-1 text-sm text-ink/60">Je weekdoel bepaalt wanneer een week “gehaald” is voor je reeks. Eerlijk kiezen loont: liever 1 keer die je haalt dan 3 die je mist.</p>
          <ActionForm action={bewaarPuntenProfiel} success="Bewaard ✓" className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink">Mijn doel</span>
              <select name="doel" defaultValue={o.profiel.doel} className="w-full rounded-xl border-2 border-borderc bg-surface px-3 py-2 text-sm text-ink">
                <option value="">Kies…</option>
                {DOEL_OPTIES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink">Keer per week</span>
              <select name="streak_target" defaultValue={String(o.profiel.streak_target)} className="rounded-xl border-2 border-borderc bg-surface px-3 py-2 text-sm text-ink">
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×</option>)}
              </select>
            </label>
            <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Bewaren</button>
          </ActionForm>
          <ActionForm action={bewaarHoeGevonden} success="Bedankt ✓" className="mt-5 flex flex-wrap items-end gap-3 border-t border-borderc pt-5">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs font-bold text-ink">Hoe vond je Fittin&rsquo;?</span>
              <select name="bron" defaultValue={o.profiel.hoe_gevonden} className="w-full rounded-xl border-2 border-borderc bg-surface px-3 py-2 text-sm text-ink">
                <option value="">Kies…</option>
                {BRON_OPTIES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <button className="rounded-full border-2 border-borderc px-5 py-2 text-sm font-bold text-ink">Bewaren</button>
          </ActionForm>
        </section>

        <section className="mt-6 rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Badges</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {o.badges.map((b) => (
              <div key={b.id} className={"rounded-2xl border p-3 " + (b.behaald ? "border-accent/40 bg-accent/10" : "border-borderc bg-paper opacity-60")}>
                <p className="text-sm font-black text-ink"><span aria-hidden>{b.behaald ? b.e : "🔒"}</span> {b.l}</p>
                <p className="mt-0.5 text-xs text-ink/60">{b.uitleg}</p>
                <p className="mt-1 text-[11px] font-bold text-accentdark">{b.behaald ? `Behaald ${b.op ? datum.format(new Date(b.op)) : ""}` : `+${b.punten}`}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Zo verdien je punten</h2>
          <div className="mt-3 divide-y divide-borderc">
            {VERDIENEN.filter(([k]) => Number(w[k]) > 0).map(([k, l, extra, href, knop]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 text-ink">{l}{extra && <span className="block text-xs text-ink/50">{extra}</span>}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-black text-accentdark">+{w[k]}</span>
                  {href && <Link href={href} className="rounded-full border border-borderc px-3 py-1 text-xs font-bold text-ink hover:border-lav">{knop} →</Link>}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-paper p-4 text-xs leading-relaxed text-ink/60">
            <p><b className="text-ink">Niveaus:</b> {NIVEAUS.map((n) => `${n.naam} (${n.vanaf})`).join(" · ")}. Vanaf Vaste klant krijg je {PERK_PCT}% extra op alles.</p>
            <p className="mt-2"><b className="text-ink">Spelregels:</b> een sessie telt na afloop; een geannuleerde of terugbetaalde sessie gaat er weer af. Maximaal {o.instellingen.maxPerLid} gratis sessie per maand. Punten hebben geen geldwaarde en vervallen na 12 maanden zonder sessie. Zie de <Link href="/voorwaarden#punten" className="font-bold text-accentdark hover:underline">voorwaarden</Link>.</p>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Waarom heb ik deze punten?</h2>
          {o.rijen.length === 0 ? <p className="mt-3 text-sm text-ink/55">Nog niets — je eerste sessie levert er al 10 (en 50 voor je startersopdracht).</p> : (
            <div className="mt-3 divide-y divide-borderc">
              {o.rijen.map((r) => {
                const s = soortLabel(r.kind);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 text-ink"><span aria-hidden>{s.e}</span> {s.l}{r.meta?.badge ? ` · ${r.meta.badge.replace(/_/g, " ")}` : ""}{r.meta?.basis && r.points > r.meta.basis ? <span className="text-xs text-ink/50"> (×{Math.round((r.points / r.meta.basis) * 10) / 10})</span> : null}</span>
                    <span className="shrink-0 text-xs text-ink/45">{datum.format(new Date(r.created_at))}</span>
                    <span className={"w-14 shrink-0 text-right font-black " + (r.points < 0 ? "text-ink/50" : "text-accentdark")}>{r.points > 0 ? "+" : ""}{r.points}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
