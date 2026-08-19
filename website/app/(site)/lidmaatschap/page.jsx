import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getGymCached, getServicesCached } from "@/lib/cache";
import { buyPackage, openBillingPortal } from "./actions";
import LegalConsent from "@/components/LegalConsent";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + (c / 100).toFixed(2).replace(".", ",");
const eur0 = (c) => "€ " + Math.round(c / 100);
// Ronde bedragen zonder ",00", maar zodra er centen zijn tonen we ze wél: een afgerond bedrag naast
// een betaalknop is een prijsvermelding die niet klopt met wat Stripe aanrekent (art. VI.46 §2 WER).
const price = (c) => (c % 100 === 0 ? eur0(c) : euro(c));

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
// Vangnet: zonder databank noemen we geen enkel bedrag, liever dan een verouderd bedrag.
const BASE_DESC =
  "Trainen bij Fittin' in Gent: losse sessie, 10-beurtenkaart of member-abonnement. Geen lidgeld, je eerste uur is gratis.";

export async function generateMetadata() {
  let description = BASE_DESC;
  try {
    const gym = await getGymCached();
    if (gym?.id) {
      const admin = createAdminClient();
      const [services, { data: packages }] = await Promise.all([
        getServicesCached(gym.id),
        admin.from("packages").select("kind, price_cents, credits").eq("gym_id", gym.id).eq("active", true),
      ]);
      const gymSvc = (services || []).find((s) => s.type === "fit60");
      const card = (packages || []).find((p) => p.kind === "beurtenkaart");
      const abo = (packages || []).find((p) => p.kind === "abonnement");
      if (gymSvc && card && abo) {
        description =
          `Trainen bij Fittin' in Gent: losse sessie ${price(gymSvc.price_cents)}, ` +
          `10-beurtenkaart ${price(card.price_cents)} (${card.credits} sessies) of ` +
          `abonnement ${price(abo.price_cents)}/maand met ${abo.credits} sessie${abo.credits === 1 ? "" : "s"} inbegrepen. ` +
          `Geen lidgeld, je eerste uur is gratis.`;
      }
    }
  } catch {
    // De metadata mag de pagina nooit doen falen; ze valt dan terug op de prijsloze tekst.
  }
  return {
    title: "Prijzen — sessies & abonnement | Fittin'",
    description,
    alternates: { canonical: `${SITE}/lidmaatschap` },
  };
}

export default async function Lidmaatschap() {
  if (!isSupabaseConfigured) redirect("/");
  // Public pricing page — visible to everyone. Buying requires login (handled per button).
  const { user, profile } = await getSessionProfile();
  // Coaches pay €12/sessie via sessietegoed in hun dashboard — geen ledenpakketten/abonnement.
  if (profile?.role === "coach") redirect("/coach");
  const admin = createAdminClient();
  const { data: defaultGym } = profile ? { data: { id: profile.gym_id } } : await admin.from("gyms").select("id").order("created_at").limit(1).single();
  const gymId = defaultGym?.id;

  const [{ data: packages }, services] = await Promise.all([
    admin.from("packages").select("*").eq("gym_id", gymId).eq("active", true).order("sort"),
    getServicesCached(gymId),
  ]);

  // Losse prijs, ledenprijs en zaalcapaciteit komen uit dezelfde services-rij waarmee create_booking
  // rekent. Een getal dat hier hardgecodeerd staat, kan die rij stilzwijgend tegenspreken.
  const gymSvc = (services || []).find((s) => s.type === "fit60") || null;
  const singleCents = gymSvc?.price_cents ?? null;
  const memberCents = gymSvc?.member_price_cents ?? null;
  const capacity = gymSvc?.capacity ?? null;

  const card = (packages || []).find((p) => p.kind === "beurtenkaart") || null;
  const abo = (packages || []).find((p) => p.kind === "abonnement") || null;
  const cardPerSession = card?.credits ? Math.round(card.price_cents / card.credits) : null;
  // "Beste prijs per sessie" is een claim, geen sierstrik: we tonen ze enkel zolang het rekenwerk
  // ze waarmaakt.
  const aboIsCheapest =
    memberCents != null &&
    (singleCents == null || memberCents < singleCents) &&
    (cardPerSession == null || memberCents < cardPerSession);

  let credits = 0, membership = null;
  if (user) {
    const supabase = await createClient();
    const [{ data: ledger }, { data: mem }] = await Promise.all([
      supabase.rpc("credits_balance", { p_user: user.id }),
      supabase.from("memberships").select("status, current_period_end, cancel_at_period_end").eq("user_id", user.id).eq("status", "actief").maybeSingle(),
    ]);
    credits = ledger || 0;
    membership = mem;
  }
  const isMember = !!membership;
  // Nieuwe accounts starten op 'eligible' (migratie 0069), dus voor een bezoeker zonder account
  // is het gratis uur altijd waar. Voor wie al ingelogd is, zeggen we het enkel als het nog klaarstaat.
  const welcomeFree = !user || (!profile?.welcome_code_used && profile?.welcome_status === "eligible");

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Sneller & voordeliger</p>
        {/* Nav, footer en deze titel noemden dezelfde pagina drie keer anders ("Prijzen",
            "Lidmaatschap", "Sessies & abonnement"). Eén naam: Prijzen. */}
        <h1 className="mt-2 text-3xl font-black md:text-4xl">Prijzen</h1>
        <p className="mt-3 text-brand/70">
          {user ? (
            <>Je saldo: <span className="font-black text-accentdark">{credits} sessies</span>.{isMember && " Je bent member — je boekt aan het voordeeltarief."}</>
          ) : (
            <>Koop sessies in bulk of word member voor het voordeeltarief. <Link href="/login?mode=signup&next=/lidmaatschap" className="font-bold text-accentdark hover:underline">Maak eerst een gratis account</Link>.</>
          )}
          {/* Uitgelogd weten we niet wie er kijkt: een bestaand lid dat zijn welkomstuur al opgebruikt
              heeft, zag hier "sowieso gratis". Voeg dan dezelfde nuance toe als /boeken; enkel voor
              wie ingelogd én effectief eligible is, mag het zonder voorbehoud. */}
          {welcomeFree && (
            <> <span className="font-bold text-accentdark">
              {user ? "Je eerste uur is sowieso gratis." : "Je eerste uur is gratis — bij je eerste boeking."}
            </span></>
          )}
        </p>

        {isMember && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand p-6 text-white">
            <div>
              <p className="font-black">✓ Actief member-abonnement</p>
              <p className="mt-1 text-sm text-lav">
                {membership.cancel_at_period_end ? "Loopt af op " : "Verlengt automatisch op "}
                {membership.current_period_end ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long" }).format(new Date(membership.current_period_end)) : "—"}
              </p>
            </div>
            <form action={openBillingPortal}>
              <button className="rounded-full bg-accent px-6 py-3 font-bold text-brand transition hover:opacity-90">Beheer abonnement</button>
            </form>
          </div>
        )}

        {/* Eén keer boven het drieluik in plaats van een personen-regel in elke kaart: het geldt
            voor alle drie de formules, en zo lezen de kaarten als drie prijzen naast elkaar. */}
        {capacity ? (
          <p className="mt-6 text-sm text-brand/60">
            Elke prijs hieronder geldt voor de <strong className="font-bold text-brand">hele zaal</strong> — 1 tot {capacity} personen, je betaalt niet per persoon.
          </p>
        ) : null}

        {/* De 3 opties — duidelijk naast elkaar */}
        <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-3">
          {/* 1. Losse sessie */}
          {singleCents != null && (
            <div className="flex flex-col rounded-3xl border border-borderc bg-white p-7">
              <p className="text-xs font-bold uppercase tracking-widest text-lav">Losse sessie</p>
              <h2 className="mt-1 text-2xl font-black text-brand">Betaal per keer</h2>
              <p className="mt-2 text-3xl font-black text-brand">
                {price(singleCents)}<span className="text-base font-bold text-brand/50"> / uur</span>
              </p>
              <p className="mt-0.5 text-xs font-bold text-brand/50">geen lidgeld, geen abo</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-brand/70">
                <li className="flex gap-2"><span className="text-accent">✓</span> Boek 1 tot 4 uur (ook 90 minuten)</li>
                <li className="flex gap-2"><span className="text-accent">✓</span> Verplaatsen kan tot 6 uur vooraf</li>
              </ul>
              <Link href={user ? "/boeken" : "/login?mode=signup&next=/boeken"} className="mt-5 block w-full rounded-full border-2 border-borderc py-3 text-center font-bold text-brand transition hover:border-accent">Boek een sessie</Link>
            </div>
          )}

          {/* 2 + 3. Beurtenkaart & abonnement (uit de packages-tabel) */}
          {(packages || []).map((p) => {
            const isAbo = p.kind === "abonnement";
            const ownsThis = isAbo && isMember;
            // Hoeveel beurten "gratis" zijn, staat nergens opgeslagen: het is wat je méér krijgt dan
            // wat hetzelfde bedrag aan de losse prijs koopt. Naar boven afgerond, zodat een
            // prijswijziging nooit meer gratis beurten belooft dan er werkelijk zijn.
            const paidEquiv = !isAbo && singleCents ? Math.ceil(p.price_cents / singleCents) : null;
            const bonus = paidEquiv != null ? p.credits - paidEquiv : 0;
            // De prijs per sessie van de beurtenkaart stond alléén in de vergelijkingstabel, en die
            // is verborgen onder 640 px: op de telefoon moest de bezoeker zelf delen om te zien dat
            // de kaart goedkoper is dan een losse sessie. Hij staat nu op de kaart zelf, net als het
            // abonnement zijn "€ 12 per sessie" toont.
            const perSession = !isAbo && p.credits ? Math.round(p.price_cents / p.credits) : null;
            const badge = isAbo ? (aboIsCheapest ? "⭐ Beste prijs / sessie" : null) : bonus > 0 ? `${paidEquiv} + ${bonus} GRATIS` : `${p.credits} SESSIES`;
            return (
              <div key={p.id} className={"relative flex flex-col rounded-3xl border-2 p-7 " + (isAbo ? "border-accent bg-white shadow-lg shadow-accent/10" : "border-brand/15 bg-white")}>
                {badge && (
                  <span className={"absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-black " + (isAbo ? "bg-accent text-brand" : "bg-brand text-white")}>
                    {badge}
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-widest text-lav">{isAbo ? "Abonnement" : "Voordeelkaart"}</p>
                <h2 className="mt-1 text-2xl font-black text-brand">{p.name}</h2>
                <p className="mt-2 text-3xl font-black text-accentdark">
                  {price(p.price_cents)}
                  {p.period === "maand" && <span className="text-base font-bold text-brand/50"> / maand</span>}
                </p>
                <p className="mt-0.5 text-xs font-bold text-brand/50">
                  {isAbo
                    ? memberCents != null ? `${price(memberCents)} per sessie` : "maandelijks opzegbaar"
                    : perSession != null ? `± ${euro(perSession)} per sessie` : `${p.credits} sessies`}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-brand/70">
                  {isAbo ? (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>{p.credits} sessie{p.credits === 1 ? "" : "s"} per maand inbegrepen</strong></li>
                      {memberCents != null && <li className="flex gap-2"><span className="text-accent">✓</span> Alle sessies aan ledenprijs <strong>{price(memberCents)}</strong></li>}
                      {/* Het enige abo-voordeel dat écht in de code zit: de boekhorizon in
                          components/booking/BookingClient.jsx (8 weken voor members, 2 zonder abo). */}
                      <li className="flex gap-2"><span className="text-accent">✓</span> Boek tot 8 weken vooruit (zonder abo: 2)</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Maandelijks opzegbaar</li>
                      <li className="flex gap-2 text-brand/45"><span className="text-brand/30">·</span> Inbegrepen sessie geldt binnen de maand (geen opsparen)</li>
                    </>
                  ) : (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>{bonus > 0 ? `${paidEquiv} + ${bonus} gratis = ${p.credits} sessies` : `${p.credits} sessies`}</strong></li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> 1 beurt = 1 uur (2 uur boeken kost 2 beurten)</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> 6 maanden geldig</li>
                    </>
                  )}
                </ul>
                {ownsThis ? (
                  <p className="mt-5 rounded-full bg-accent/15 py-3 text-center font-bold text-accentdark">Je bent al member ✓</p>
                ) : user ? (
                  <form action={buyPackage} className="mt-5">
                    <input type="hidden" name="packageId" value={p.id} />
                    {/* Knoptekst vermeldt de betalingsverplichting (art. VI.46 §2 WER): "Word member"
                        alleen zegt niet dat er betaald wordt. Het bedrag komt uit dezelfde kolom die
                        buyPackage aan Stripe doorgeeft, zodat knop en afrekening niet uiteen kunnen lopen. */}
                    <LegalConsent label={isAbo ? `Word member — ${price(p.price_cents)}${p.period === "maand" ? "/maand" : ""} betalen` : `Koop kaart — ${price(p.price_cents)} betalen`} />
                  </form>
                ) : (
                  <Link href="/login?mode=signup&next=/lidmaatschap" className="mt-5 block w-full rounded-full bg-accent py-3 text-center font-bold text-brand transition hover:opacity-90">{isAbo ? "Word member" : "Koop kaart"}</Link>
                )}
              </div>
            );
          })}
          {(!packages || packages.length === 0) && <p className="text-sm text-brand/50">Nog geen pakketten beschikbaar.</p>}
        </div>

        {/* Prijzen vergeleken — op de telefoon werd dit een zijwaartse scroller; daar doen de drie
            kaarten en de adviesalinea hieronder het werk al. Het cijfer dat de kaart verkoopt (prijs
            per sessie) staat sinds kort op de kaart zelf, dus mobiel mist niets meer. */}
        <div className="hidden sm:block">
          <h2 className="mt-12 text-xl font-black text-brand">Prijzen vergeleken</h2>
          <div className="mt-3 overflow-x-auto rounded-3xl border border-borderc bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-borderc text-xs font-bold uppercase tracking-wide text-lav">
                  <th className="p-4">Optie</th><th className="p-4">Prijs</th><th className="p-4">Per sessie</th><th className="p-4">Ideaal voor</th>
                </tr>
              </thead>
              <tbody className="text-brand/80">
                {singleCents != null && (
                  <tr className="border-b border-borderc/60">
                    <td className="p-4 font-bold text-brand">Losse sessie</td>
                    <td className="p-4">{price(singleCents)}</td>
                    <td className="p-4">{price(singleCents)}</td>
                    <td className="p-4">af en toe trainen</td>
                  </tr>
                )}
                {card && (
                  <tr className="border-b border-borderc/60">
                    <td className="p-4 font-bold text-brand">{card.name}</td>
                    <td className="p-4">{price(card.price_cents)} · {card.credits} sessies</td>
                    <td className="p-4">{cardPerSession != null ? `± ${euro(cardPerSession)}` : "—"}</td>
                    <td className="p-4">regelmatig, zonder abo</td>
                  </tr>
                )}
                {abo && (
                  <tr className="bg-accent/10">
                    <td className="p-4 font-black text-accentdark">Abonnement {aboIsCheapest && "⭐"}</td>
                    <td className="p-4 font-bold text-brand">{price(abo.price_cents)} / maand</td>
                    <td className="p-4 font-bold text-brand">{memberCents != null ? price(memberCents) : "—"}</td>
                    <td className="p-4 font-semibold text-brand">wie vast traint</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* mt-6 op mobiel: daar valt de tabel hierboven weg en zou de alinea tegen de kaarten plakken. */}
        {abo && card && singleCents != null && memberCents != null && (
          <p className="mt-6 text-sm leading-relaxed text-brand/70 sm:mt-3">
            <strong className="text-accentdark">Train je minstens één keer per maand?</strong> Dan zit je met het abonnement
            het goedkoopst: je eerste sessie van de maand zit in de {price(abo.price_cents)}, elke volgende kost {price(memberCents)} in
            plaats van {price(singleCents)}. Train je een maand niets, dan betaal je dat bedrag wél — blijf dan bij losse sessies,
            of neem de {card.name} die {card.credits} sessies geeft en 6 maanden meegaat.
          </p>
        )}

        <p className="mt-8 text-xs text-brand/40">
          Veilig betalen via Stripe. Gekochte sessies zijn 6 maanden geldig; de inbegrepen abo-sessie geldt binnen de maand.
          Abonnementen verlengen automatisch en kunnen op elk moment via "Beheer abonnement" stopgezet worden.
        </p>
      </div>
    </main>
  );
}
