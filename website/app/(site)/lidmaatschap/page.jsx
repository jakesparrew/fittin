import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { buyPackage, openBillingPortal } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sessies & abonnement | Fittin'" };
const euro = (c) => "€ " + (c / 100).toFixed(2).replace(".", ",");

export default async function Lidmaatschap() {
  if (!isSupabaseConfigured) redirect("/");
  // Public pricing page — visible to everyone. Buying requires login (handled per button).
  const { user, profile } = await getSessionProfile();
  const admin = createAdminClient();
  const { data: defaultGym } = profile ? { data: { id: profile.gym_id } } : await admin.from("gyms").select("id").order("created_at").limit(1).single();
  const gymId = defaultGym?.id;

  const { data: packages } = await admin.from("packages").select("*").eq("gym_id", gymId).eq("active", true).order("sort");

  let credits = 0, membership = null;
  if (user) {
    const supabase = await createClient();
    const [{ data: ledger }, { data: mem }] = await Promise.all([
      supabase.from("credits_ledger").select("delta").eq("user_id", user.id).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      supabase.from("memberships").select("status, current_period_end, cancel_at_period_end").eq("user_id", user.id).eq("status", "actief").maybeSingle(),
    ]);
    credits = (ledger || []).reduce((a, r) => a + r.delta, 0);
    membership = mem;
  }
  const isMember = !!membership;

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Sneller & voordeliger</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">Sessies & abonnement</h1>
        <p className="mt-3 text-brand/70">
          {user ? (
            <>Je saldo: <span className="font-black text-accentdark">{credits} sessies</span>.{isMember && " Je bent member — je boekt aan het voordeeltarief."}</>
          ) : (
            <>Koop sessies in bulk of word member voor het voordeeltarief. <Link href="/login?mode=signup&next=/lidmaatschap" className="font-bold text-accentdark hover:underline">Maak eerst een gratis account</Link>.</>
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

        {/* De 3 opties — duidelijk naast elkaar */}
        <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-3">
          {/* 1. Losse sessie */}
          <div className="flex flex-col rounded-3xl border border-borderc bg-white p-7">
            <p className="text-xs font-bold uppercase tracking-widest text-lav">Losse sessie</p>
            <h2 className="mt-1 text-2xl font-black text-brand">Per sessie</h2>
            <p className="mt-2 text-3xl font-black text-brand">€ 15</p>
            <p className="mt-0.5 text-xs font-bold text-brand/50">€ 15 per sessie · geen verplichting</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-brand/70">
              <li className="flex gap-2"><span className="text-accent">✓</span> 1 uur, de hele zaal voor jou</li>
              <li className="flex gap-2"><span className="text-accent">✓</span> 1 tot 4 personen</li>
              <li className="flex gap-2"><span className="text-accent">✓</span> Betaal per keer, geen abo</li>
            </ul>
            <Link href={user ? "/boeken" : "/login?mode=signup&next=/boeken"} className="mt-5 block w-full rounded-full border-2 border-borderc py-3 text-center font-bold text-brand transition hover:border-accent">Boek een sessie</Link>
          </div>

          {/* 2 + 3. Beurtenkaart & abonnement (uit de packages-tabel) */}
          {(packages || []).map((p) => {
            const isAbo = p.kind === "abonnement";
            const ownsThis = isAbo && isMember;
            const perSession = euro(Math.round(p.price_cents / Math.max(1, p.credits)));
            return (
              <div key={p.id} className={"relative flex flex-col rounded-3xl border-2 p-7 " + (isAbo ? "border-accent bg-white shadow-lg shadow-accent/10" : "border-brand/15 bg-white")}>
                <span className={"absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-black " + (isAbo ? "bg-accent text-brand" : "bg-brand text-white")}>
                  {isAbo ? "⭐ Beste prijs / sessie" : "10 + 1 GRATIS"}
                </span>
                <p className="text-xs font-bold uppercase tracking-widest text-lav">{isAbo ? "Abonnement" : "Voordeelkaart"}</p>
                <h2 className="mt-1 text-2xl font-black text-brand">{p.name}</h2>
                <p className="mt-2 text-3xl font-black text-accentdark">
                  {euro(p.price_cents)}
                  {p.period === "maand" && <span className="text-base font-bold text-brand/50"> / maand</span>}
                </p>
                <p className="mt-0.5 text-xs font-bold text-brand/50">{isAbo ? "= € 12 per sessie (goedkoopste)" : `${p.credits} sessies · ${perSession} per sessie`}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-brand/70">
                  {isAbo ? (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>1 sessie / maand inbegrepen</strong></li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Boek al je sessies aan <strong>€ 12</strong> i.p.v. € 15</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Sessietegoed vervalt niet zolang je lid bent</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Voorrang bij events &amp; member-only acties</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Automatisch verlengd · stop wanneer je wil</li>
                    </>
                  ) : (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>10 betaald + 1 gratis = {p.credits} sessies</strong></li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> € 150 i.p.v. € 165 — je bespaart € 15</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> 6 maanden geldig · neem tot 3 vrienden mee per sessie</li>
                    </>
                  )}
                </ul>
                {ownsThis ? (
                  <p className="mt-5 rounded-full bg-accent/15 py-3 text-center font-bold text-accentdark">Je bent al member ✓</p>
                ) : user ? (
                  <form action={buyPackage} className="mt-5">
                    <input type="hidden" name="packageId" value={p.id} />
                    <button className="w-full rounded-full bg-accent py-3 font-bold text-brand transition hover:opacity-90">{isAbo ? "Word member" : "Koop kaart"}</button>
                  </form>
                ) : (
                  <Link href="/login?mode=signup&next=/lidmaatschap" className="mt-5 block w-full rounded-full bg-accent py-3 text-center font-bold text-brand transition hover:opacity-90">{isAbo ? "Word member" : "Koop kaart"}</Link>
                )}
              </div>
            );
          })}
          {(!packages || packages.length === 0) && <p className="text-sm text-brand/50">Nog geen pakketten beschikbaar.</p>}
        </div>

        {/* Prijzen vergeleken — eronder, zodat de beste keuze duidelijk is */}
        <h2 className="mt-12 text-xl font-black text-brand">Prijzen vergeleken</h2>
        <div className="mt-3 overflow-x-auto rounded-3xl border border-borderc bg-white">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-borderc text-xs font-bold uppercase tracking-wide text-lav">
                <th className="p-4">Optie</th><th className="p-4">Wat je betaalt</th><th className="p-4">Per sessie</th><th className="p-4">Beste voor</th>
              </tr>
            </thead>
            <tbody className="text-brand/80">
              <tr className="border-b border-borderc/60">
                <td className="p-4 font-bold text-brand">Losse sessie</td><td className="p-4">€ 15 per keer</td><td className="p-4">€ 15</td><td className="p-4">af en toe trainen</td>
              </tr>
              <tr className="border-b border-borderc/60">
                <td className="p-4 font-bold text-brand">10-beurtenkaart</td><td className="p-4">€ 150 → 11 sessies <span className="text-brand/40">(10 + 1 gratis)</span></td><td className="p-4">€ 13,64</td><td className="p-4">regelmatig, zonder abo</td>
              </tr>
              <tr className="bg-accent/10">
                <td className="p-4 font-black text-accentdark">Abonnement ⭐</td><td className="p-4 font-bold text-brand">€ 12 / maand</td><td className="p-4 font-black text-accentdark">€ 12</td><td className="p-4 font-semibold text-brand">wie vast traint — goedkoopste</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-brand/70">
          <strong className="text-accentdark">De laagste prijs per sessie is het abonnement: € 12.</strong> De 10-beurtenkaart geeft je <strong>10 + 1 gratis</strong> (11 sessies voor € 150 = € 13,64/sessie i.p.v. € 165) en is ideaal als je geen vast abonnement wil. Een losse sessie blijft € 15. Train je 2× per maand of meer? Dan is het abonnement het voordeligst.
        </p>

        <p className="mt-8 text-xs text-brand/40">
          Veilig betalen via Stripe. Sessies worden direct bijgeschreven na betaling (6 maanden geldig).
          Abonnementen verlengen automatisch en kunnen op elk moment via "Beheer abonnement" stopgezet worden.
        </p>
      </div>
    </main>
  );
}
