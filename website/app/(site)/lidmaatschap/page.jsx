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
const eur0 = (c) => "€ " + Math.round(c / 100); // whole-euro headline price (no ,00)

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
            <p className="mt-0.5 text-xs font-bold text-brand/50">geen verplichting</p>
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
            return (
              <div key={p.id} className={"relative flex flex-col rounded-3xl border-2 p-7 " + (isAbo ? "border-accent bg-white shadow-lg shadow-accent/10" : "border-brand/15 bg-white")}>
                <span className={"absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-black " + (isAbo ? "bg-accent text-brand" : "bg-brand text-white")}>
                  {isAbo ? "⭐ Beste prijs / sessie" : "10 + 1 GRATIS"}
                </span>
                <p className="text-xs font-bold uppercase tracking-widest text-lav">{isAbo ? "Abonnement" : "Voordeelkaart"}</p>
                <h2 className="mt-1 text-2xl font-black text-brand">{p.name}</h2>
                <p className="mt-2 text-3xl font-black text-accentdark">
                  {eur0(p.price_cents)}
                  {p.period === "maand" && <span className="text-base font-bold text-brand/50"> / maand</span>}
                </p>
                <p className="mt-0.5 text-xs font-bold text-brand/50">{isAbo ? "goedkoopste per sessie" : "11 sessies — 10 + 1 gratis"}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-brand/70">
                  {isAbo ? (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>1 sessie per maand inbegrepen</strong></li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Alle sessies aan ledenprijs <strong>€ 12</strong></li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Voorrang bij events &amp; member-acties</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Maandelijks opzegbaar</li>
                      <li className="flex gap-2 text-brand/45"><span className="text-brand/30">·</span> Inbegrepen sessie geldt binnen de maand (geen opsparen)</li>
                    </>
                  ) : (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>10 + 1 gratis = {p.credits} sessies</strong></li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> 6 maanden geldig</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Neem tot 3 vrienden mee per sessie</li>
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
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead>
              <tr className="border-b border-borderc text-xs font-bold uppercase tracking-wide text-lav">
                <th className="p-4">Optie</th><th className="p-4">Prijs</th><th className="p-4">Ideaal voor</th>
              </tr>
            </thead>
            <tbody className="text-brand/80">
              <tr className="border-b border-borderc/60">
                <td className="p-4 font-bold text-brand">Losse sessie</td><td className="p-4">€ 15</td><td className="p-4">af en toe trainen</td>
              </tr>
              <tr className="border-b border-borderc/60">
                <td className="p-4 font-bold text-brand">10-beurtenkaart</td><td className="p-4">€ 150 · 11 sessies</td><td className="p-4">regelmatig, zonder abo</td>
              </tr>
              <tr className="bg-accent/10">
                <td className="p-4 font-black text-accentdark">Abonnement ⭐</td><td className="p-4 font-bold text-brand">€ 12 / maand</td><td className="p-4 font-semibold text-brand">wie vast traint</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-brand/70">
          <strong className="text-accentdark">Train je 2× per maand of meer?</strong> Dan zit je met het abonnement het goedkoopst. Wil je flexibel blijven, kies de 10-beurtenkaart (10 + 1 gratis). Train je af en toe? Boek gewoon een losse sessie.
        </p>

        <p className="mt-8 text-xs text-brand/40">
          Veilig betalen via Stripe. Gekochte sessies zijn 6 maanden geldig; de inbegrepen abo-sessie geldt binnen de maand.
          Abonnementen verlengen automatisch en kunnen op elk moment via "Beheer abonnement" stopgezet worden.
        </p>
      </div>
    </main>
  );
}
