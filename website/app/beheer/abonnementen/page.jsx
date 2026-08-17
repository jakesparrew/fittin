import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TrendLine } from "@/components/admin/Charts";
import ListSearch from "@/components/admin/ListSearch";
import InsightActions from "@/components/admin/InsightActions";

export const dynamic = "force-dynamic";

// Waarom deze pagina bestaat: de tegel "Abonnementen" op het dashboard linkte naar de gewone
// ledenlijst, waar geen enkel abo-cijfer staat. Je zag wél dat er zes abonnees waren, maar niet
// wie er waarde uithaalt en wie op het punt staat op te zeggen.
//
// Leidraad (owner-credo): elk cijfer hier moet tot een beslissing leiden. Vandaar het rekensommetje
// hieronder als ruggengraat van de pagina.
//
// DE REKENSOM. Met abo betaal je € 12/maand waarvan één sessie inbegrepen, en € 12 voor elke
// volgende. Voor n sessies in een maand is dat 12 + (n−1)×12 = 12n. Zonder abo betaal je 15n.
// Gevolg: vanaf één sessie per maand is het abo altijd voordeliger (€ 3 per sessie), maar bij NUL
// sessies betaal je € 12 voor niets. Dát is het churn-signaal — niet "weinig geboekt", maar
// "betaald zonder iets terug te krijgen". Wie dat twee maanden na elkaar doet, zegt op.
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const dag = (iso) =>
  iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";
const maandenSinds = (iso) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / (30.44 * 86400000)) : 0);

export default async function Abonnementen({ searchParams }) {
  const zoek = String((await searchParams)?.q || "").trim().toLowerCase();
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym } = ctx;
  const admin = createAdminClient();

  const [{ data: mems }, { data: bookings }, { data: pays }] = await Promise.all([
    admin.from("memberships")
      .select("user_id, status, started_at, current_period_end, cancel_at_period_end, member:profiles!memberships_user_id_fkey(full_name, email)")
      .eq("gym_id", gym.id),
    // Alle bevestigde sessies van deze leden; we hebben ze per maand nodig én de laatste datum.
    admin.from("bookings").select("user_id, starts_at, status, payment_source").eq("gym_id", gym.id).eq("status", "bevestigd"),
    admin.from("payments").select("user_id, amount_cents, kind, status, created_at").eq("gym_id", gym.id).eq("kind", "abonnement"),
  ]);

  const nu = Date.now();
  const bkByUser = new Map();
  for (const b of bookings || []) {
    if (!bkByUser.has(b.user_id)) bkByUser.set(b.user_id, []);
    bkByUser.get(b.user_id).push(b);
  }
  const paidByUser = new Map();
  for (const p of pays || []) {
    const betaald = (p.status || "betaald") === "betaald" || p.status === "paid";
    if (!betaald) continue;
    paidByUser.set(p.user_id, (paidByUser.get(p.user_id) || 0) + (p.amount_cents || 0));
  }

  const rijen = (mems || []).map((m) => {
    const maanden = maandenSinds(m.started_at);
    const eigen = (bkByUser.get(m.user_id) || []).filter((b) => new Date(b.starts_at) >= new Date(m.started_at) && new Date(b.starts_at) <= nu);
    const sessies = eigen.length;
    const perMaand = maanden > 0.5 ? sessies / maanden : sessies;
    const laatste = eigen.length ? eigen.map((b) => new Date(b.starts_at).getTime()).sort((a, b) => b - a)[0] : null;
    const dagenStil = laatste ? Math.floor((nu - laatste) / 86400000) : null;
    const betaald = paidByUser.get(m.user_id) || 0;
    // Voordeel = wat hij zónder abo betaald zou hebben (€ 15/sessie) min wat het abo hem kostte.
    // Bewust gerekend op de ÉCHT betaalde abonnementsgelden, niet op "aantal maanden sinds de
    // start": een gemiste of terugbetaalde maand zou anders als kost meetellen terwijl er niets
    // afgeschreven is. Elke betaalde maand bevat één inbegrepen sessie; de rest kost € 12.
    const betaaldeMaanden = Math.round(betaald / 1200);
    const extraSessies = Math.max(0, sessies - betaaldeMaanden);
    const voordeel = sessies * 1500 - (betaald + extraSessies * 1200);
    return { ...m, maanden, sessies, perMaand, dagenStil, betaald, voordeel };
  });

  // Zoeken op naam of e-mail. De cijfers bovenaan blijven op de VOLLEDIGE set staan: een
  // zoekopdracht mag je MRR of het aantal slapers niet stiekem doen dalen.
  const zichtbaar = !zoek ? rijen : rijen.filter((r) =>
    [r.member?.full_name, r.member?.email].some((v) => String(v || "").toLowerCase().includes(zoek)));
  const actief = zichtbaar.filter((r) => r.status === "actief");
  const pastDue = zichtbaar.filter((r) => r.status === "past_due");
  const gestopt = zichtbaar.filter((r) => r.status !== "actief" && r.status !== "past_due");
  const alleActief = rijen.filter((r) => r.status === "actief");
  const mrr = alleActief.length * 1200;
  const gemMaanden = alleActief.length ? alleActief.reduce((a, r) => a + r.maanden, 0) / alleActief.length : 0;

  // Slapend = betaalt wel, boekt niet. Het enige geval waarin het abo geld kost in plaats van
  // bespaart, en dus de beste voorspeller van een opzegging.
  const slapend = alleActief.filter((r) => r.dagenStil == null || r.dagenStil > 30);
  const opzeggend = alleActief.filter((r) => r.cancel_at_period_end);

  // Verloop van het aantal abonnees, week per week sinds het eerste abonnement. Toont de RICHTING:
  // groeit de vaste basis, of komt er net zoveel bij als eraf gaat? Een abonnement telt mee vanaf
  // de startdatum tot het effectief eindigt (bij een opzegging is dat het einde van de betaalde
  // periode, niet het moment van opzeggen — tot dan is het lid gewoon lid).
  const eersteStart = (mems || []).reduce((a, m) => (m.started_at && (!a || m.started_at < a) ? m.started_at : a), null);
  const verloop = [];
  if (eersteStart) {
    const start = new Date(eersteStart).getTime();
    for (let t = start; t <= nu + 6 * 86400000; t += 7 * 86400000) {
      const punt = Math.min(t, nu);
      const aantal = (mems || []).filter((m) => {
        if (!m.started_at || new Date(m.started_at).getTime() > punt) return false;
        const gestoptStatus = m.status !== "actief" && m.status !== "past_due";
        const eind = m.current_period_end ? new Date(m.current_period_end).getTime() : null;
        if (gestoptStatus && eind && eind < punt) return false;
        return true;
      }).length;
      verloop.push({
        label: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(new Date(punt)),
        value: aantal,
      });
    }
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Abonnementen</h1>
          <p className="mt-1 text-sm text-brand/50">Wie betaalt er maandelijks, wat halen ze eruit, en wie dreigt te vertrekken.</p>
        </div>
        <Link href="/beheer/leden" className="rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm font-bold text-brand transition hover:border-accent">Alle leden →</Link>
      </div>

      {/* De ?q=-filter hierboven bestond al, alleen het invoerveld ontbrak: zoeken kon enkel door
          zelf ?q= in de adresbalk te typen. */}
      <div className="mt-4">
        <ListSearch placeholder="Zoek een abonnee op naam of e-mail…" className="w-full max-w-md" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Actieve abonnementen" value={alleActief.length} hint={`${euro(mrr)} per maand vast`} />
        <Stat label="Gemiddeld lid sinds" value={`${gemMaanden.toFixed(1)} mnd`} hint="hoe langer, hoe waardevoller" />
        <Stat label="Slapend" value={slapend.length} hint="betaalt maar boekt niet" danger={slapend.length > 0} />
        <Stat label="Loopt af / mislukt" value={opzeggend.length + pastDue.length} hint={pastDue.length ? `${pastDue.length} betaling mislukt` : "opgezegd maar nog lopend"} danger={opzeggend.length + pastDue.length > 0} />
      </div>

      {slapend.length > 0 && (
        <div className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="font-black text-amber-700">⚠ {slapend.length} {slapend.length === 1 ? "abonnee betaalt" : "abonnees betalen"} zonder te trainen</p>
          <p className="mt-1 text-sm text-brand/70">
            Zij betalen € 12 per maand en krijgen er niets voor terug. Dat is het duidelijkste signaal vóór een opzegging —
            en meteen het makkelijkst om te keren met één persoonlijk bericht. {slapend.map((r) => r.member?.full_name).filter(Boolean).join(", ")}.
          </p>
        </div>
      )}

      {verloop.length >= 2 && (
        <section className="mt-8 rounded-2xl border border-borderc bg-white p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-lav">Abonnees door de tijd</h2>
          <p className="mt-1 text-xs text-brand/45">
            Week per week sinds het eerste abonnement. Stijgt de lijn, dan groeit je vaste inkomen; blijft ze vlak
            terwijl er wel nieuwe bijkomen, dan vertrekt er evenveel als er binnenkomt.
          </p>
          <div className="mt-3">
            <TrendLine data={verloop} label="abonnees vandaag" />
          </div>
        </section>
      )}

      <Tabel titel={`Actief (${actief.length})`} rijen={actief} />
      {pastDue.length > 0 && <Tabel titel={`Betaling mislukt (${pastDue.length})`} rijen={pastDue} />}
      {gestopt.length > 0 && <Tabel titel={`Gestopt (${gestopt.length})`} rijen={gestopt} gestopt />}

      <p className="mt-8 text-xs leading-relaxed text-brand/40">
        <b>Hoe "voordeel" berekend wordt:</b> met abonnement betaal je € 12 per maand (één sessie inbegrepen) plus € 12 per
        extra sessie; zonder abonnement € 15 per sessie. Vanaf één sessie per maand is het abonnement dus altijd voordeliger.
        Boekt iemand een maand niets, dan kost het abonnement hem € 12 zonder tegenprestatie — dat trekt dit cijfer omlaag.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, danger }) {
  return (
    <div className={"rounded-2xl border bg-white p-5 " + (danger ? "border-amber-300" : "border-borderc")}>
      <p className="text-xs font-bold uppercase tracking-wide text-lav">{label}</p>
      <p className={"mt-1 text-3xl font-black " + (danger ? "text-amber-600" : "text-brand")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-brand/50">{hint}</p>}
    </div>
  );
}

function Tabel({ titel, rijen, gestopt = false }) {
  if (!rijen.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xs font-black uppercase tracking-widest text-lav">{titel}</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-4 py-3">Lid</th>
              <th className="px-4 py-3">Lid sinds</th>
              <th className="px-4 py-3" title="Sessies gedeeld door het aantal maanden dat het abonnement loopt">Ritme</th>
              <th className="px-4 py-3">Laatste sessie</th>
              <th className="px-4 py-3" title="Wat het abonnement dit lid opleverde tegenover losse sessies aan € 15">Voordeel</th>
              <th className="px-4 py-3">Betaald</th>
              <th className="px-4 py-3">Verlengt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {rijen.map((r) => {
              const stil = !gestopt && (r.dagenStil == null || r.dagenStil > 21);
              return (
                <tr key={r.user_id} className={stil ? "bg-amber-50/60" : ""}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-brand">{r.member?.full_name || "Lid"}</p>
                    {/* Een slapende abonnee betaalt zonder te trainen — de beste opzeg-voorspeller.
                        Het inzicht en de handeling horen op dezelfde rij: hier terughalen, niet
                        eerst doorklikken naar een andere lijst. */}
                    {stil && (
                      <InsightActions
                        memberId={r.user_id}
                        acties={[
                          { type: "preset", preset: "winback", label: "✉ Comeback-mail", busy: "Versturen…" },
                          { type: "reeks", reeks: "comeback_reeks", label: "📬 Comeback-reeks", busy: "Inschrijven…" },
                        ]}
                      />
                    )}
                    <p className="text-xs text-brand/40">{r.member?.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand/70">
                    {dag(r.started_at)}
                    <span className="block text-xs text-brand/40">{r.maanden.toFixed(1)} maanden</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={"font-black " + (r.perMaand >= 2 ? "text-accentdark" : r.perMaand >= 1 ? "text-brand" : "text-amber-600")}>
                      {r.perMaand.toFixed(1)}×
                    </span>
                    <span className="block text-xs text-brand/40">per maand · {r.sessies} totaal</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.dagenStil == null ? (
                      <span className="font-bold text-amber-600">nooit geboekt</span>
                    ) : (
                      <span className={r.dagenStil > 21 ? "font-bold text-amber-600" : "text-brand/70"}>
                        {r.dagenStil === 0 ? "vandaag" : r.dagenStil + " dagen geleden"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={"font-bold " + (r.voordeel > 0 ? "text-accentdark" : "text-amber-600")}>
                      {r.voordeel > 0 ? "+" : ""}{euro(r.voordeel)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand/70">{euro(r.betaald)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {gestopt ? (
                      <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold capitalize text-brand/50">{r.status}</span>
                    ) : r.cancel_at_period_end ? (
                      <span className="text-xs font-bold text-amber-600">stopt {dag(r.current_period_end)}</span>
                    ) : (
                      <span className="text-xs text-brand/60">{dag(r.current_period_end)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
