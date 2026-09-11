import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { telOp, DAGBUDGET_MICRO, beginVanVandaag, euroVan } from "@/lib/coaching/budget.js";
import { coachAan } from "@/lib/coaching/model.js";
import { fmtDate, fmtDay } from "@/lib/format";
import CoachTesten from "@/components/admin/CoachTesten";

export const dynamic = "force-dynamic";

// Wat de eigenaar over de AI-coach moet kunnen zien, en niets meer.
//
// Drie vragen, in deze volgorde:
//   1. Ligt er werk? Een doorverwijzing is een lead voor een échte coach — dat is het enige op deze
//      pagina waar iemand iets mee moet doen, dus staat het bovenaan.
//   2. Wat kost het? De dagrem is de enige echte veiligheid tegen een model dat op hol slaat, dus
//      staat de stand ervan hier en niet in een logbestand.
//   3. Wie gebruikt het? Eén regel per lopend plan. Geen dossiers: het weekmenu en de check-ins van
//      een lid zijn van dat lid, en een beheerpagina is geen reden om erin te lezen.

const KAART = "rounded-2xl border border-borderc bg-surface p-5";

export default async function BeheerCoaching() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym } = ctx;
  const db = createAdminClient();
  const dertigDagen = new Date(Date.now() - 30 * 86400000).toISOString();

  const [plannenR, verbruikR, menusR, mijlpalenR, cronR] = await Promise.all([
    db.from("coaching_plans")
      .select("id, member_id, doel, weken, status, gestart_op, afgerond_at, doorverwezen_at, doorverwijs_reden, updated_at")
      .eq("gym_id", gym.id).order("updated_at", { ascending: false }).limit(200),
    db.from("coaching_verbruik").select("soort, model, kost_micro, in_tokens, uit_tokens, ok, resultaat, created_at")
      .eq("gym_id", gym.id).gte("created_at", dertigDagen).limit(5000),
    db.from("coaching_mealweeks").select("id, created_at").eq("gym_id", gym.id).gte("created_at", dertigDagen),
    db.from("coaching_mijlpalen").select("soort").eq("gym_id", gym.id).gte("created_at", dertigDagen),
    // cron_runs heeft GEEN gym_id (het is een systeemtabel, 26k rijen). Altijd op job filteren en
    // nooit optellen — alleen de laatste beurt is hier interessant.
    db.from("cron_runs").select("ok, detail, created_at").eq("job", "coaching_week")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const plannen = plannenR.data || [];
  const verbruik = verbruikR.data || [];
  const ledenIds = [...new Set(plannen.map((p) => p.member_id))];
  const { data: leden } = ledenIds.length
    ? await db.from("profiles").select("id, full_name, email, coaching_modules").in("id", ledenIds)
    : { data: [] };
  const naam = new Map((leden || []).map((l) => [l.id, l]));

  // De weken van de lopende plannen, om "week 3 van 8" te kunnen tonen.
  const lopend = plannen.filter((p) => p.status === "lopend");
  const { data: weken } = lopend.length
    ? await db.from("coaching_weeks").select("plan_id, weeknummer, unlocked_at, completed_at").in("plan_id", lopend.map((p) => p.id))
    : { data: [] };
  const openVan = new Map();
  for (const w of weken || []) {
    if (!w.unlocked_at || w.completed_at) continue;
    const vorige = openVan.get(w.plan_id);
    if (!vorige || w.weeknummer > vorige) openVan.set(w.plan_id, w.weeknummer);
  }

  const vandaag = beginVanVandaag();
  const dag = telOp(verbruik.filter((r) => r.created_at >= vandaag));
  const maand = telOp(verbruik);
  const perSoort = {};
  for (const r of verbruik) {
    perSoort[r.soort] = perSoort[r.soort] || { aanroepen: 0, micro: 0, mislukt: 0 };
    perSoort[r.soort].aanroepen++;
    perSoort[r.soort].micro += r.kost_micro || 0;
    if (!r.ok) perSoort[r.soort].mislukt++;
  }

  const leads = plannen.filter((p) => p.doorverwezen_at).slice(0, 20);
  const remVol = dag.micro >= DAGBUDGET_MICRO;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">AI-coach</h1>
          <p className="mt-1 text-sm text-ink-soft">Plannen, kosten en doorverwijzingen van de laatste 30 dagen.</p>
        </div>
        <span className={"rounded-full px-3 py-1.5 text-xs font-black " + (coachAan() ? "bg-accent/15 text-accentdark" : "bg-paper text-ink/45")}>
          {coachAan() ? "Staat aan" : "Staat uit"}
        </span>
      </div>

      {/* 0. Draait het? Zonder deze regel is "er gebeurt niets" niet te onderscheiden van "de cron
             draait niet" — en dat was precies de vraag van de eigenaar. */}
      {(() => {
        const c = cronR?.data;
        const kleur = !c ? "bg-paper text-ink-soft"
          : c.detail?.status === "bezig" ? "bg-amber-50 text-amber-800"
          : c.ok ? "bg-accent/10 text-ink" : "bg-amber-50 text-amber-800";
        return (
          <div className={"mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm " + kleur}>
            <span>
              {!c ? "Zondagcron: nog nooit gedraaid."
                : c.detail?.status === "bezig" ? `Zondagrun van ${fmtDay(c.created_at)} is nooit afgerond — de functie werd afgekapt.`
                : c.detail?.uit ? `Laatste zondagrun (${fmtDay(c.created_at)}): de coach stond uit.`
                : `Zondagrun ${fmtDay(c.created_at)}: ${c.detail?.geopend || 0} weken geopend, ${c.detail?.gevraagd || 0} check-ins gevraagd, ${c.detail?.menus || 0} menu's${c.detail?.overgeslagen ? `, ${c.detail.overgeslagen} overgeslagen` : ""}${c.detail?.fouten?.length ? `, ${c.detail.fouten.length} fouten` : ""}.`}
            </span>
            <Link href="/beheer/coaching/logboek" className="shrink-0 text-xs font-bold underline">Logboek →</Link>
          </div>
        );
      })()}

      {/* 1. Waar iemand iets mee moet doen. */}
      {leads.length > 0 && (
        <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="font-display text-lg font-black text-ink">Doorverwezen naar een echte coach ({leads.length})</h2>
          <p className="mt-1 text-sm text-ink/70">
            Bij deze leden gaf de AI-coach het op: meerdere weken te zwaar, of pijn. Ze zagen een
            uitnodiging voor een gratis intake. Een telefoontje doet hier meer dan een e-mail.
          </p>
          <ul className="mt-4 space-y-2">
            {leads.map((p) => {
              const l = naam.get(p.member_id);
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-surface px-4 py-3">
                  <span className="min-w-0">
                    <Link href={`/beheer/leden/${p.member_id}`} className="text-sm font-black text-ink hover:underline">
                      {l?.full_name || l?.email || "Onbekend lid"}
                    </Link>
                    <span className="ml-2 text-xs text-ink/50">{p.doorverwijs_reden || "reden onbekend"}</span>
                  </span>
                  <span className="text-xs text-ink/45">{fmtDate(p.doorverwezen_at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 2. Wat het kost. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Vandaag</p>
          <p className={"mt-1 font-display text-2xl font-black " + (remVol ? "text-red-600" : "text-ink")}>{euroVan(dag.micro)}</p>
          <p className="mt-1 text-xs text-ink/45">
            {dag.aanroepen} aanroep{dag.aanroepen === 1 ? "" : "en"} · rem op {euroVan(DAGBUDGET_MICRO)}
          </p>
          <p className="mt-0.5 text-xs text-ink/35">{dag.inTokens.toLocaleString("nl-BE")} tokens in · {dag.uitTokens.toLocaleString("nl-BE")} uit</p>
          {dag.geweigerd > 0 && <p className="mt-1 text-xs font-bold text-amber-700">{dag.geweigerd}× geweigerd door de dagrem</p>}
          {remVol && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Dagrem bereikt — de coach maakt vandaag niets meer.</p>}
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">30 dagen</p>
          <p className="mt-1 font-display text-2xl font-black text-ink">{euroVan(maand.micro)}</p>
          <p className="mt-1 text-xs text-ink/45">{maand.aanroepen} aanroepen · {maand.mislukt} mislukt</p>
          <p className="mt-0.5 text-xs text-ink/35">{maand.inTokens.toLocaleString("nl-BE")} tokens in · {maand.uitTokens.toLocaleString("nl-BE")} uit</p>
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Lopende plannen</p>
          <p className="mt-1 font-display text-2xl font-black text-ink">{lopend.length}</p>
          <p className="mt-1 text-xs text-ink/45">{plannen.filter((p) => p.status === "afgerond").length} afgerond</p>
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Weekmenu&rsquo;s</p>
          <p className="mt-1 font-display text-2xl font-black text-ink">{(menusR.data || []).length}</p>
          <p className="mt-1 text-xs text-ink/45">{(mijlpalenR.data || []).length} mijlpalen gehaald</p>
        </div>
      </section>

      {Object.keys(perSoort).length > 0 && (
        <section className={"mt-6 " + KAART}>
          <h2 className="font-display text-lg font-black text-ink">Waar het geld naartoe gaat</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-borderc text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="pb-2 font-bold">Soort</th>
                <th className="pb-2 text-right font-bold">Aanroepen</th>
                <th className="pb-2 text-right font-bold">Mislukt</th>
                <th className="pb-2 text-right font-bold">Kost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(perSoort).sort((a, b) => b[1].micro - a[1].micro).map(([soort, s]) => (
                <tr key={soort} className="border-b border-borderc/60 last:border-0">
                  <td className="py-2 font-bold text-ink">{soort}</td>
                  <td className="py-2 text-right text-ink/70">{s.aanroepen}</td>
                  <td className={"py-2 text-right " + (s.mislukt ? "font-bold text-red-600" : "text-ink/40")}>{s.mislukt}</td>
                  <td className="py-2 text-right text-ink/70">{euroVan(s.micro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink/40">
            Omgerekend aan een vaste koers van 0,92 — ter indicatie, niet als boekhouding.
          </p>
        </section>
      )}

      {/* 2b. Wat er wegging zonder resultaat. Alleen tonen als er iets te melden is — leeg is
             onzichtbaar. Dit bestaat omdat `ok` alleen zegt dat de gateway antwoordde: op productie
             stond 72% van alle uitgaven op "geslaagd" terwijl er geen plan uit kwam. Zie 0161. */}
      {(maand.zonderResultaat > 0 || maand.onbekend > 0 || maand.geweigerd > 0) && (
        <Link href="/beheer/coaching/logboek?filter=problemen"
          className="mt-3 block rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 transition hover:border-amber-400">
          <p className="text-sm font-black text-ink">
            {maand.zonderResultaat > 0
              ? `${euroVan(maand.zonderResultaatMicro)} aan aanroepen zonder resultaat (${maand.zonderResultaat} van ${maand.aanroepen})`
              : "Aanroepen om na te kijken"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            {maand.onbekend > 0 && `${maand.onbekend} aanroep${maand.onbekend === 1 ? "" : "en"} van vóór dit logboek — resultaat onbekend. `}
            {maand.geweigerd > 0 && `${maand.geweigerd}× geweigerd door de dagrem. `}
            Bekijk ze in het logboek →
          </p>
        </Link>
      )}

      <CoachTesten email={ctx.profile?.email || ""} />

      {/* 3. Wie het gebruikt. */}
      <section className={"mt-6 " + KAART}>
        <h2 className="font-display text-lg font-black text-ink">Lopende plannen</h2>
        {!lopend.length ? (
          <p className="mt-2 text-sm text-ink-soft">Nog geen enkel lid heeft een plan lopen.</p>
        ) : (
          <ul className="mt-3 divide-y divide-borderc">
            {lopend.map((p) => {
              const l = naam.get(p.member_id);
              const nu = openVan.get(p.id);
              const modules = (l?.coaching_modules || []).filter((m) => m !== "workouts");
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <Link href={`/beheer/leden/${p.member_id}`} className="text-sm font-bold text-ink hover:underline">
                      {l?.full_name || l?.email || "Onbekend lid"}
                    </Link>
                    <span className="ml-2 text-xs text-ink/50">{p.doel}</span>
                    {modules.map((m) => (
                      <span key={m} className="ml-1.5 rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold text-ink/55">{m}</span>
                    ))}
                  </span>
                  <span className="text-xs text-ink/45">
                    week {nu || "?"} van {p.weken} · gestart {fmtDate(p.gestart_op)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
