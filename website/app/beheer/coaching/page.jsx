import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { telOp, DAGBUDGET_MICRO, beginVanVandaag } from "@/lib/coaching/budget.js";
import { coachAan } from "@/lib/coaching/model.js";
import { fmtDate } from "@/lib/format";

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

const KAART = "rounded-2xl border border-borderc bg-white p-5";
const euro = (micro) => "€ " + (micro / 1_000_000 * 0.92).toFixed(2).replace(".", ",");

export default async function BeheerCoaching() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym } = ctx;
  const db = createAdminClient();
  const dertigDagen = new Date(Date.now() - 30 * 86400000).toISOString();

  const [plannenR, verbruikR, menusR, mijlpalenR] = await Promise.all([
    db.from("coaching_plans")
      .select("id, member_id, doel, weken, status, gestart_op, afgerond_at, doorverwezen_at, doorverwijs_reden, updated_at")
      .eq("gym_id", gym.id).order("updated_at", { ascending: false }).limit(200),
    db.from("coaching_verbruik").select("soort, model, kost_micro, in_tokens, uit_tokens, ok, created_at")
      .eq("gym_id", gym.id).gte("created_at", dertigDagen).limit(5000),
    db.from("coaching_mealweeks").select("id, created_at").eq("gym_id", gym.id).gte("created_at", dertigDagen),
    db.from("coaching_mijlpalen").select("soort").eq("gym_id", gym.id).gte("created_at", dertigDagen),
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
          <h1 className="font-display text-2xl font-black text-brand">AI-coach</h1>
          <p className="mt-1 text-sm text-ink-soft">Plannen, kosten en doorverwijzingen van de laatste 30 dagen.</p>
        </div>
        <span className={"rounded-full px-3 py-1.5 text-xs font-black " + (coachAan() ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/45")}>
          {coachAan() ? "Staat aan" : "Staat uit"}
        </span>
      </div>

      {/* 1. Waar iemand iets mee moet doen. */}
      {leads.length > 0 && (
        <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="font-display text-lg font-black text-brand">Doorverwezen naar een echte coach ({leads.length})</h2>
          <p className="mt-1 text-sm text-brand/70">
            Bij deze leden gaf de AI-coach het op: meerdere weken te zwaar, of pijn. Ze zagen een
            uitnodiging voor een gratis intake. Een telefoontje doet hier meer dan een e-mail.
          </p>
          <ul className="mt-4 space-y-2">
            {leads.map((p) => {
              const l = naam.get(p.member_id);
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-white px-4 py-3">
                  <span className="min-w-0">
                    <Link href={`/beheer/leden/${p.member_id}`} className="text-sm font-black text-brand hover:underline">
                      {l?.full_name || l?.email || "Onbekend lid"}
                    </Link>
                    <span className="ml-2 text-xs text-brand/50">{p.doorverwijs_reden || "reden onbekend"}</span>
                  </span>
                  <span className="text-xs text-brand/45">{fmtDate(p.doorverwezen_at)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 2. Wat het kost. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-brand/45">Vandaag</p>
          <p className={"mt-1 font-display text-2xl font-black " + (remVol ? "text-red-600" : "text-brand")}>{euro(dag.micro)}</p>
          <p className="mt-1 text-xs text-brand/45">
            {dag.aanroepen} aanroep{dag.aanroepen === 1 ? "" : "en"} · rem op {euro(DAGBUDGET_MICRO)}
          </p>
          {remVol && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Dagrem bereikt — de coach maakt vandaag niets meer.</p>}
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-brand/45">30 dagen</p>
          <p className="mt-1 font-display text-2xl font-black text-brand">{euro(maand.micro)}</p>
          <p className="mt-1 text-xs text-brand/45">{maand.aanroepen} aanroepen · {maand.mislukt} mislukt</p>
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-brand/45">Lopende plannen</p>
          <p className="mt-1 font-display text-2xl font-black text-brand">{lopend.length}</p>
          <p className="mt-1 text-xs text-brand/45">{plannen.filter((p) => p.status === "afgerond").length} afgerond</p>
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-brand/45">Weekmenu&rsquo;s</p>
          <p className="mt-1 font-display text-2xl font-black text-brand">{(menusR.data || []).length}</p>
          <p className="mt-1 text-xs text-brand/45">{(mijlpalenR.data || []).length} mijlpalen gehaald</p>
        </div>
      </section>

      {Object.keys(perSoort).length > 0 && (
        <section className={"mt-6 " + KAART}>
          <h2 className="font-display text-lg font-black text-brand">Waar het geld naartoe gaat</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-borderc text-left text-xs uppercase tracking-wide text-brand/40">
                <th className="pb-2 font-bold">Soort</th>
                <th className="pb-2 text-right font-bold">Aanroepen</th>
                <th className="pb-2 text-right font-bold">Mislukt</th>
                <th className="pb-2 text-right font-bold">Kost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(perSoort).sort((a, b) => b[1].micro - a[1].micro).map(([soort, s]) => (
                <tr key={soort} className="border-b border-borderc/60 last:border-0">
                  <td className="py-2 font-bold text-brand">{soort}</td>
                  <td className="py-2 text-right text-brand/70">{s.aanroepen}</td>
                  <td className={"py-2 text-right " + (s.mislukt ? "font-bold text-red-600" : "text-brand/40")}>{s.mislukt}</td>
                  <td className="py-2 text-right text-brand/70">{euro(s.micro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-brand/40">
            Omgerekend aan een vaste koers van 0,92 — ter indicatie, niet als boekhouding.
          </p>
        </section>
      )}

      {/* 3. Wie het gebruikt. */}
      <section className={"mt-6 " + KAART}>
        <h2 className="font-display text-lg font-black text-brand">Lopende plannen</h2>
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
                    <Link href={`/beheer/leden/${p.member_id}`} className="text-sm font-bold text-brand hover:underline">
                      {l?.full_name || l?.email || "Onbekend lid"}
                    </Link>
                    <span className="ml-2 text-xs text-brand/50">{p.doel}</span>
                    {modules.map((m) => (
                      <span key={m} className="ml-1.5 rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold text-brand/55">{m}</span>
                    ))}
                  </span>
                  <span className="text-xs text-brand/45">
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
