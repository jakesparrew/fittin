import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { addCoach, adminAddUser } from "../actions";
import SearchSelect from "@/components/admin/SearchSelect";
import ListSearch from "@/components/admin/ListSearch";
import CoachRow from "@/components/admin/CoachRow";
import ActionForm from "@/components/ui/ActionForm";
import { BarChart } from "@/components/admin/Charts";
import { coachDebts, debtOf } from "@/lib/coach-debt";
import { COACH_SESSIE_KOLOMMEN, coachStats, statsVan, perWeek } from "@/lib/coach-stats";

// Het coach-overzicht. Herbouwd omdat de vorige versie zeven kaarten van ~730 px onder elkaar zette
// (396 px zelfs voor iemand die nooit één sessie deed), zodat je nooit twee coaches naast elkaar
// zag, en omdat er nergens een euro op stond: het enige geldveld dat werd opgehaald
// (coach_charge_cents) is sinds 0128 structureel 0, terwijl de echte coach-omzet in `payments`
// staat en niet werd bevraagd.
//
// Alle vijftien bedieningen bestaan nog; ze verhuisden naar /beheer/coaches/[id].

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
// De noemer is bewust afgebakend: dit zijn de vier soorten waarmee de gym zélf geld verdient.
// kind='overig' blijft eruit — daar zit wat een CLIENT via het platform aan ZIJN COACH betaalt
// (coach_payment_requests) plus event-inschrijvingen. Doorstroomgeld, geen gymomzet; zat het in de
// noemer, dan zou het coach-aandeel juist zakken in een kwartaal waarin er méér gecoacht wordt.
const GYM_KINDS = ["booking", "beurtenkaart", "abonnement", "coach_credits"];
const BETAALD = ["betaald", "paid"];

export default async function Coaches({ searchParams }) {
  const zoek = String((await searchParams)?.q || "").trim().toLowerCase();
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const nu = new Date();
  const venster = new Date(nu.getTime() - 190 * 86400000).toISOString(); // ~6 maanden, tijdvenster i.p.v. een limiet

  const [{ data: people }, { data: sessies }, { data: coachPay }, { data: gymPay }, { data: ledger }, schuld] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, coach_public, is_test").eq("gym_id", gym.id).order("full_name"),
    // coach_id, NIET coach_billing: dat laatste filter wist elke sessie die de beheerder voor een
    // coach inboekte (zie de nota in lib/coach-stats.js).
    supabase.from("bookings").select(COACH_SESSIE_KOLOMMEN).eq("gym_id", gym.id).not("coach_id", "is", null).gte("starts_at", venster).limit(4000),
    supabase.from("payments").select("user_id, amount_cents, status").eq("gym_id", gym.id).eq("kind", "coach_credits").in("status", BETAALD),
    supabase.from("payments").select("amount_cents").eq("gym_id", gym.id).in("kind", GYM_KINDS).in("status", BETAALD),
    supabase.from("coach_ledger").select("coach_id, delta").eq("gym_id", gym.id).limit(5000),
    coachDebts(supabase, gym.id),
  ]);

  const all = people || [];
  const testIds = new Set(all.filter((p) => p.is_test).map((p) => p.id));
  const alleCoaches = all.filter((p) => p.role === "coach" || p.role === "beheerder");
  const nonCoaches = all.filter((p) => p.role === "lid" && !p.is_test);

  const stats = coachStats(sessies || [], nu);
  const saldo = {};
  for (const r of ledger || []) saldo[r.coach_id] = (saldo[r.coach_id] || 0) + Number(r.delta || 0);
  const betaald = {};
  for (const p of coachPay || []) if (!testIds.has(p.user_id)) betaald[p.user_id] = (betaald[p.user_id] || 0) + (p.amount_cents || 0);

  const coachOmzet = Object.values(betaald).reduce((a, n) => a + n, 0);
  const gymOmzet = (gymPay || []).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const aandeel = gymOmzet > 0 ? Math.round((coachOmzet / gymOmzet) * 100) : 0;

  // Actief = ooit een bevestigde sessie, of geld betaald, of iets openstaand. De rest is slapend en
  // hoort niet tussen de mensen die de zaal dragen — maar verdwijnt nooit uit de lijst: "Bekijk als
  // coach" bestaat alleen op deze pagina, en dat is de knop waarmee je de coach-app test.
  const leeft = (c) => statsVan(stats, c.id).totaal > 0 || betaald[c.id] > 0 || debtOf(schuld, c.id).totaalCents > 0;

  const signaalVan = (c) => {
    const s = statsVan(stats, c.id);
    const d = debtOf(schuld, c.id);
    const bal = saldo[c.id] || 0;
    // Eerste treffer wint: geld > dood tegoed > weggezakt. Eén signaal per coach, anders is de
    // strook binnen een maand versleten behang.
    if (d.totaalCents >= 2400) return { ernst: 0, icoon: "💶", tekst: `${c.full_name || c.email} staat ${euro(d.totaalCents)} open — zijn boekingen zijn geblokkeerd tot dat vereffend is.` };
    // Drempels bewust streng: 21 dagen stilte erbij, anders vuurt dit bij elke coach die week per
    // week boekt in plaats van vooruit — dus potentieel elke zondagavond opnieuw.
    if (bal >= 5 && s.gepland === 0 && (s.dagenGeleden ?? 999) > 21) return { ernst: 1, icoon: "🎟", tekst: `${c.full_name || c.email} heeft ${String(bal).replace(".", ",")} beurten liggen en niets ingepland — al ${s.dagenGeleden} dagen niet geweest.` };
    if (s.totaal >= 5 && (s.dagenGeleden ?? 0) > 30) return { ernst: 2, icoon: "🌙", tekst: `${c.full_name || c.email} deed ${s.totaal} sessies maar is al ${s.dagenGeleden} dagen niet geweest.` };
    return null;
  };

  const metSignaal = new Map();
  for (const c of alleCoaches) {
    if (c.is_test) continue; // een testaccount is geen signaal
    const sig = signaalVan(c);
    if (sig) metSignaal.set(c.id, sig);
  }

  const gefilterd = !zoek ? alleCoaches : alleCoaches.filter((p) =>
    [p.full_name, p.email].some((v) => String(v || "").toLowerCase().includes(zoek)));

  const actief = gefilterd.filter(leeft).sort((a, b) => {
    const sa = metSignaal.get(a.id)?.ernst ?? 9;
    const sb = metSignaal.get(b.id)?.ernst ?? 9;
    if (sa !== sb) return sa - sb;
    return statsVan(stats, b.id).sessies90 - statsVan(stats, a.id).sessies90;
  });
  const slapend = gefilterd.filter((c) => !leeft(c));
  const drukste = Math.max(0, ...actief.map((c) => statsVan(stats, c.id).sessies90));

  const signalen = [...metSignaal.entries()]
    .filter(([id]) => gefilterd.some((c) => c.id === id))
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => a.ernst - b.ernst);

  // Grafiek: coach-sessies per week, laatste 12 VOLLEDIGE weken. Testaccounts eruit.
  const echteSessies = (sessies || []).filter((b) => !testIds.has(b.coach_id));
  const { reeks, dezeWeek } = perWeek(echteSessies, nu, 12);
  const totaalWeken = reeks.reduce((a, p) => a + p.value, 0);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Coaches</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Coaches huren de zaal aan € 12 per beurt en kopen vooraf. Zij brachten{" "}
        <strong className="text-brand">{euro(coachOmzet)}</strong> op
        {aandeel > 0 && <> — {aandeel} % van de {euro(gymOmzet)} die de gym ooit ontving</>}.
      </p>

      {/* Signaalstrook: smalle regels, geen kaarten. Nul signalen is een geldige uitkomst en
          krijgt één gedempte regel in plaats van een leeg kader. */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-borderc bg-white">
        {signalen.length === 0 ? (
          // "Elke coach heeft betaald en is recent nog geweest" stond hier eerst, en dat was
          // aantoonbaar onwaar: Jean Francois staat € 12 open en is 63 dagen weg — hij haalt
          // alleen de drempels niet. Een lege strook betekent "niets dringend", niet "alles goed".
          <p className="px-4 py-3 text-sm text-ink-soft">Niets dat vandaag om actie vraagt.</p>
        ) : (
          signalen.slice(0, 3).map((s) => (
            <Link key={s.id} href={`/beheer/coaches/${s.id}`} className="flex items-center gap-3 border-t border-borderc px-4 py-2.5 text-sm transition first:border-t-0 hover:bg-paper/60">
              <span aria-hidden>{s.icoon}</span>
              <span className="min-w-0 flex-1 text-brand">{s.tekst}</span>
              <span className="shrink-0 text-brand/30">›</span>
            </Link>
          ))
        )}
        {signalen.length > 3 && (
          <details className="border-t border-borderc">
            <summary className="cursor-pointer px-4 py-2 text-xs font-bold text-ink-soft">+ {signalen.length - 3} meer</summary>
            {signalen.slice(3).map((s) => (
              <Link key={s.id} href={`/beheer/coaches/${s.id}`} className="flex items-center gap-3 border-t border-borderc px-4 py-2.5 text-sm hover:bg-paper/60">
                <span aria-hidden>{s.icoon}</span><span className="min-w-0 flex-1 text-brand">{s.tekst}</span>
              </Link>
            ))}
          </details>
        )}
      </div>

      {/* Zoeken pas vanaf 9 coaches: bij vijf namen op één scherm is een zoekbalk ruis. */}
      {alleCoaches.length >= 9 && (
        <div className="mt-5"><ListSearch placeholder="Zoek een coach op naam of e-mail…" className="w-full max-w-md" /></div>
      )}

      {/* Het roster */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-borderc bg-white">
        <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] gap-x-3 border-b border-borderc bg-paper/60 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-lav md:grid">
          <span>Coach</span><span>Sessies 90 d</span><span>Laatst</span><span>Gepland</span><span>Tegoed</span><span>Betaald ooit</span><span />
        </div>
        {actief.map((c) => (
          <CoachRow key={c.id} coach={c} stats={statsVan(stats, c.id)} saldo={saldo[c.id] || 0}
            schuld={debtOf(schuld, c.id)} betaaldCents={betaald[c.id] || 0} drukste={drukste} />
        ))}
        {actief.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink-soft">{zoek ? `Geen coach gevonden voor “${zoek}”.` : "Nog geen actieve coach."}</p>
        )}
      </div>

      {slapend.length > 0 && (
        <details className="mt-3 overflow-hidden rounded-2xl border border-borderc bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink-soft">Slapend · {slapend.length} <span className="font-normal">— nooit een sessie, niets open</span></summary>
          <div className="border-t border-borderc">
            {slapend.map((c) => (
              <CoachRow key={c.id} coach={c} stats={statsVan(stats, c.id)} saldo={saldo[c.id] || 0}
                schuld={debtOf(schuld, c.id)} betaaldCents={betaald[c.id] || 0} drukste={drukste} gedempt />
            ))}
          </div>
        </details>
      )}

      {/* De grafiek staat ONDER de tabel: het roster beantwoordt een dagelijkse vraag, de grafiek
          een maandelijkse. De lopende week zit er bewust niet in — die staat ernaast als tekst,
          anders leest een halve week naast volle weken als een instorting die er niet is. */}
      <div className="mt-6 rounded-2xl border border-borderc bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-black text-brand">Coach-sessies per week</p>
          <p className="text-xs text-ink-soft">laatste 12 volledige weken · deze week tot nu: <strong className="text-brand">{dezeWeek}</strong></p>
        </div>
        {totaalWeken === 0 ? (
          <p className="py-6 text-center text-xs text-ink-soft">Nog geen coach-sessies in deze periode.</p>
        ) : (
          <div className="mt-3"><BarChart data={reeks} height={130} accentLast={false} /></div>
        )}
      </div>

      {/* Coach toevoegen: een paar keer per jaar, dus onderaan en ingeklapt. */}
      <details className="mt-3 rounded-2xl border border-borderc bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink-soft">+ Coach toevoegen</summary>
        <div className="grid gap-4 border-t border-borderc p-4 lg:grid-cols-2">
          <ActionForm action={addCoach} success="Coach toegevoegd ✓" className="flex flex-wrap items-end gap-2 rounded-xl bg-paper/60 p-4">
            <Lbl t="Maak een bestaand lid coach">
              <SearchSelect name="memberId" required placeholder="Kies een lid…" options={nonCoaches.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
            </Lbl>
            <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">+ Coach toevoegen</button>
          </ActionForm>
          <ActionForm action={adminAddUser} success="Coach aangemaakt + uitnodiging verstuurd ✓" className="flex flex-wrap items-end gap-2 rounded-xl bg-paper/60 p-4">
            <input type="hidden" name="role" value="coach" />
            <Lbl t="Nieuwe coach (naam)">
              <input name="full_name" required placeholder="Voornaam Naam" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            </Lbl>
            <Lbl t="E-mail">
              <input name="email" type="email" required placeholder="coach@…" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            </Lbl>
            <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">+ Aanmaken</button>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}

function Lbl({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
