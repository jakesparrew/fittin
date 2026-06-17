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

        {/* Quick comparison */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-borderc bg-white p-4 text-center">
            <p className="text-2xl font-black text-brand">€ 15</p>
            <p className="text-xs font-bold text-brand/50">losse sessie</p>
          </div>
          <div className="rounded-2xl border-2 border-accent bg-accent/5 p-4 text-center">
            <p className="text-2xl font-black text-accentdark">€ 10</p>
            <p className="text-xs font-bold text-brand/50">als member / sessie</p>
          </div>
          <div className="rounded-2xl border border-borderc bg-white p-4 text-center">
            <p className="text-2xl font-black text-brand">+1</p>
            <p className="text-xs font-bold text-brand/50">gratis sessie / maand</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-brand/60">Train je 2× per maand? Dan verdient je abonnement zichzelf al terug.</p>

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

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {(packages || []).map((p) => {
            const isAbo = p.kind === "abonnement";
            const ownsThis = isAbo && isMember;
            return (
              <div key={p.id} className={"relative rounded-3xl border p-7 " + (isAbo ? "border-2 border-accent bg-white shadow-lg shadow-accent/10" : "border-borderc bg-white")}>
                {isAbo && <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-black text-brand">Meest gekozen</span>}
                <p className="text-xs font-bold uppercase tracking-widest text-lav">{isAbo ? "Abonnement" : "Voordeelkaart"}</p>
                <h2 className="mt-1 text-2xl font-black">{p.name}</h2>
                <p className="mt-2 text-3xl font-black text-accentdark">
                  {euro(p.price_cents)}
                  {p.period === "maand" && <span className="text-base font-bold text-brand/50"> / maand</span>}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-brand/70">
                  {isAbo ? (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> <strong>{p.credits} gratis sessie / maand</strong> inbegrepen</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Boek daarna aan <strong>€ 10</strong> i.p.v. € 15</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Je sessietegoed vervalt niet zolang je lid bent</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Member-only acties &amp; kortingscodes</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Voorrang bij events &amp; challenges</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Automatisch verlengd · stop wanneer je wil</li>
                    </>
                  ) : (
                    <>
                      <li className="flex gap-2"><span className="text-accent">✓</span> {p.credits} sessies · {euro(Math.round(p.price_cents / p.credits))} per sessie</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> 6 maanden geldig</li>
                      <li className="flex gap-2"><span className="text-accent">✓</span> Deel met vrienden</li>
                    </>
                  )}
                </ul>
                {ownsThis ? (
                  <p className="mt-5 rounded-full bg-accent/15 py-3 text-center font-bold text-accentdark">Je bent al member ✓</p>
                ) : user ? (
                  <form action={buyPackage} className="mt-5">
                    <input type="hidden" name="packageId" value={p.id} />
                    <button className="w-full rounded-full bg-accent py-3 font-bold text-brand transition hover:opacity-90">
                      {isAbo ? "Word member" : "Kopen"}
                    </button>
                  </form>
                ) : (
                  <Link href="/login?mode=signup&next=/lidmaatschap" className="mt-5 block w-full rounded-full bg-accent py-3 text-center font-bold text-brand transition hover:opacity-90">
                    {isAbo ? "Word member" : "Kopen"}
                  </Link>
                )}
              </div>
            );
          })}
          {(!packages || packages.length === 0) && <p className="text-sm text-brand/50">Nog geen pakketten beschikbaar.</p>}
        </div>

        <p className="mt-8 text-xs text-brand/40">
          Veilig betalen via Stripe. Sessies worden direct bijgeschreven na betaling (6 maanden geldig).
          Abonnementen verlengen automatisch en kunnen op elk moment via "Beheer abonnement" stopgezet worden.
        </p>
      </div>
    </main>
  );
}
