import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logboekVoor, perDag, resultaatTekst } from "@/lib/coaching/logboek.js";
import { euroVan } from "@/lib/coaching/budget.js";
import { fmtDay, fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logboek AI-coach | Fittin'", robots: { index: false } };

// Alles wat de coach deed, nieuwste eerst.
//
// Wat hier NIET staat, en waarom dat een keuze is: de inhoud van een check-in en van een weekmenu.
// 0158 geeft coaching_mealweeks bewust geen coachbeleid omdat voeding gevoeliger is dan een schema.
// Datzelfde argument geldt voor een beheerder die alles zou kunnen zien zonder er iets mee te doen.
// Het logboek meldt DAT er een check-in was, niet wat erin stond.
//
// Geen eigen item in de zijbalk: dit hangt als sublink onder /beheer/coaching en is er alleen als
// er iets te tonen valt.

const KAART = "rounded-2xl border border-borderc bg-surface p-5";

const ICOON = {
  plan: "◉", plan_af: "⏹", doorverwezen: "→", week_open: "▸", week_af: "✔",
  sessie: "✓", checkin: "◍", menu: "🍽", mijlpaal: "★", aanroep: "◈", geweigerd: "⛔",
};

function zin(r, naam) {
  const wie = <Link href={`/beheer/leden/${r.memberId}`} className="font-bold text-ink hover:underline">{naam}</Link>;
  switch (r.soort) {
    case "plan": return <>Plan gemaakt voor {wie} — {r.weken} weken, {r.doel}</>;
    case "plan_af": return <>Plan afgerond — {wie}, {r.weken} weken uit</>;
    case "doorverwezen": return <>Doorverwezen naar een echte coach — {wie}: {r.reden || "reden onbekend"}</>;
    case "week_open": return <>Week {r.weeknummer} open voor {wie}{r.besluit ? ` (${r.besluit})` : ""}</>;
    case "week_af": return <>Week {r.weeknummer} afgerond — {wie}</>;
    case "sessie": return <>Sessie {r.volgnummer} afgevinkt — {wie}{r.oordeel ? ` · ${r.oordeel.replace("_", " ")}` : ""}</>;
    case "checkin": return <>Check-in ingevuld — {wie}, week {r.weeknummer} <span className="text-ink/35">(inhoud niet getoond)</span></>;
    case "menu": return <>Weekmenu geleverd — {wie}, week {r.weeknummer}</>;
    case "mijlpaal": return <>Mijlpaal — {wie}: {r.titel}</>;
    case "geweigerd": return <>Geweigerd door de dagrem — {wie}: {r.fout}</>;
    case "aanroep":
      return <>Aanroep &lsquo;{r.aanroepSoort}&rsquo; voor {wie}{r.probleem ? <span className="text-amber-700"> — {resultaatTekst(r.resultaat) || (r.ok ? "niets opgeleverd" : `mislukt: ${String(r.fout || "").slice(0, 120)}`)}</span> : r.resultaat == null ? <span className="text-ink/35"> — resultaat onbekend (van vóór dit logboek)</span> : ` — ${resultaatTekst(r.resultaat)}`}</>;
    default: return <>{r.soort} — {wie}</>;
  }
}

export default async function Logboek({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const sp = (await searchParams) || {};
  const dagen = [7, 30, 90].includes(Number(sp.dagen)) ? Number(sp.dagen) : 30;
  const alleenProblemen = sp.filter === "problemen";
  const lid = typeof sp.lid === "string" ? sp.lid : null;

  const db = createAdminClient();
  const { regels, namen, telling } = await logboekVoor(db, { gymId: ctx.gym.id, dagen, memberId: lid });
  const zichtbaar = alleenProblemen ? regels.filter((r) => r.probleem) : regels;
  const dagenLijst = perDag(zichtbaar);

  // De laatste cronbeurt. cron_runs heeft geen gym_id, dus altijd op job filteren en nooit tellen.
  const { data: cron } = await db.from("cron_runs")
    .select("ok, detail, created_at").eq("job", "coaching_week")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const chip = (aan) => "rounded-full px-3.5 py-1.5 text-xs font-bold transition " +
    (aan ? "bg-brand text-white" : "bg-surface text-ink/60 ring-1 ring-borderc hover:text-ink");
  const q = (extra) => {
    const p = new URLSearchParams();
    if (dagen !== 30) p.set("dagen", String(dagen));
    if (alleenProblemen) p.set("filter", "problemen");
    if (lid) p.set("lid", lid);
    for (const [k, v] of Object.entries(extra)) { if (v === null) p.delete(k); else p.set(k, String(v)); }
    const s = p.toString();
    return `/beheer/coaching/logboek${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <Link href="/beheer/coaching" className="text-xs font-bold text-ink/50 hover:underline">← AI-coach</Link>
      <h1 className="mt-2 font-display text-2xl font-black text-ink">Logboek AI-coach</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Alles wat de coach deed, nieuwste eerst. Wat het kostte staat erbij; wat erin stond niet.
      </p>

      {/* De zondagcron. Zonder deze regel is "er gebeurt niets" niet te onderscheiden van "hij draait niet". */}
      <div className={"mt-5 rounded-2xl px-4 py-3 text-sm " + (!cron ? "bg-paper text-ink-soft" : cron.detail?.status === "bezig" ? "bg-amber-50 text-amber-800" : cron.ok ? "bg-accent/10 text-ink" : "bg-amber-50 text-amber-800")}>
        {!cron ? "Zondagcron: nog nooit gedraaid." : cron.detail?.status === "bezig"
          ? <>Zondagrun van {fmtDay(cron.created_at)} is nooit afgerond — de functie werd afgekapt vóór ze klaar was.</>
          : cron.detail?.uit ? <>Laatste zondagrun ({fmtDay(cron.created_at)}): de coach stond uit.</>
          : <>Zondagrun {fmtDay(cron.created_at)}: {cron.detail?.geopend || 0} weken geopend, {cron.detail?.gevraagd || 0} check-ins gevraagd, {cron.detail?.menus || 0} menu&rsquo;s, {cron.detail?.afgerond || 0} afgerond{cron.detail?.overgeslagen ? ` · ${cron.detail.overgeslagen} overgeslagen` : ""}{cron.detail?.fouten?.length ? ` · ${cron.detail.fouten.length} fouten` : ""}.</>}
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Kost</p>
          <p className="mt-1 font-display text-2xl font-black text-ink">{euroVan(telling.micro)}</p>
          <p className="mt-1 text-xs text-ink/45">over {dagen} dagen</p>
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Tokens uit</p>
          <p className="mt-1 font-display text-2xl font-black text-ink">{telling.uitTokens.toLocaleString("nl-BE")}</p>
          <p className="mt-1 text-xs text-ink/45">de uitvoer betaalt het meeste</p>
        </div>
        <div className={KAART}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Zonder resultaat</p>
          <p className={"mt-1 font-display text-2xl font-black " + (telling.problemen ? "text-amber-700" : "text-ink")}>{telling.problemen}</p>
          <p className="mt-1 text-xs text-ink/45">
            {telling.problemen ? `${euroVan(telling.problemenMicro)} weg` : "alles leverde iets op"}
            {telling.onbekend ? ` · ${telling.onbekend} onbekend` : ""}
          </p>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={q({ filter: null })} className={chip(!alleenProblemen)}>Alles</Link>
        <Link href={q({ filter: "problemen" })} className={chip(alleenProblemen)}>Alleen problemen</Link>
        <span className="mx-1 w-px bg-borderc" />
        {[7, 30, 90].map((d) => (
          <Link key={d} href={q({ dagen: d })} className={chip(dagen === d)}>{d} dagen</Link>
        ))}
        {lid && <Link href="/beheer/coaching/logboek" className={chip(false)}>× alle leden</Link>}
      </div>

      {!dagenLijst.length ? (
        <p className="mt-6 rounded-2xl bg-paper px-4 py-6 text-center text-sm text-ink-soft">
          {alleenProblemen ? "Geen problemen in deze periode." : "Nog niets gebeurd in deze periode."}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {dagenLijst.map((d) => (
            <section key={d.dag}>
              <div className="flex items-baseline justify-between border-b border-borderc pb-1.5">
                <h2 className="text-sm font-black text-ink">{fmtDay(d.regels[0].tijd)}</h2>
                {d.micro > 0 && (
                  <span className="text-xs text-ink/45">{euroVan(d.micro)} · {d.aanroepen} aanroep{d.aanroepen === 1 ? "" : "en"}</span>
                )}
              </div>
              <ul className="mt-2 space-y-1.5">
                {d.regels.map((r, i) => (
                  <li key={`${r.soort}-${r.tijd}-${i}`} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-1 text-sm">
                    <span className="w-10 shrink-0 tabular-nums text-xs text-ink/35">{fmtTime(r.tijd)}</span>
                    <span className={"w-4 shrink-0 text-center " + (r.probleem ? "text-amber-600" : "text-ink/35")}>{ICOON[r.soort] || "·"}</span>
                    <span className="min-w-0 flex-1 text-ink-soft">{zin(r, namen.get(r.memberId) || "Onbekend lid")}</span>
                    {r.soort === "aanroep" && (
                      <span className="shrink-0 text-xs tabular-nums text-ink/35">
                        {r.model?.replace("anthropic/", "")} · {r.inTokens}/{r.uitTokens} · {euroVan(r.micro)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-ink/40">
        Bedragen omgerekend aan een vaste koers van 0,92 (handmatig, 10-09-2026) — ter indicatie, geen
        boekhouding. Aanroepen van vóór 11-09 dragen geen uitkomst en tellen daarom als &ldquo;onbekend&rdquo;
        in plaats van als verspilling: achteraf raden welke ervan iets opleverde, is precies de gok
        waar de uitkomstkolom een eind aan maakt.
      </p>
    </div>
  );
}
