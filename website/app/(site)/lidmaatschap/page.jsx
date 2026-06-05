import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { buyPackage } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beurtenkaarten & abonnement | Fittin'" };
const euro = (c) => "€ " + (c / 100).toFixed(2).replace(".", ",");

export default async function Lidmaatschap() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/lidmaatschap");

  const supabase = await createClient();
  const [{ data: packages }, { data: ledger }] = await Promise.all([
    supabase.from("packages").select("*").eq("gym_id", profile.gym_id).eq("active", true).order("sort"),
    supabase.from("credits_ledger").select("delta").eq("user_id", user.id),
  ]);
  const credits = (ledger || []).reduce((a, r) => a + r.delta, 0);

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Sneller boeken</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">Beurtenkaarten</h1>
        <p className="mt-3 text-brand/70">
          Koop sessies vooraf en boek sneller. Je saldo:{" "}
          <span className="font-black text-accentdark">{credits} sessies</span>.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {(packages || []).map((p) => (
            <div key={p.id} className="rounded-3xl border border-borderc bg-white p-7">
              <p className="text-xs font-bold uppercase tracking-widest text-lav">
                {p.kind === "beurtenkaart" ? "Voordeelkaart" : "Abonnement"}
              </p>
              <h2 className="mt-1 text-2xl font-black">{p.name}</h2>
              <p className="mt-2 text-3xl font-black text-accentdark">
                {euro(p.price_cents)}
                {p.period === "maand" && <span className="text-base font-bold text-brand/50"> / maand</span>}
              </p>
              <p className="mt-1 text-sm text-brand/60">
                {p.credits} {p.credits === 1 ? "sessie" : "sessies"}
                {p.kind === "beurtenkaart" && ` · ${euro(Math.round(p.price_cents / p.credits))} per sessie`}
              </p>
              <form action={buyPackage} className="mt-5">
                <input type="hidden" name="packageId" value={p.id} />
                <button className="w-full rounded-full bg-accent py-3 font-bold text-brand transition hover:opacity-90">
                  Kopen
                </button>
              </form>
            </div>
          ))}
          {(!packages || packages.length === 0) && (
            <p className="text-sm text-brand/50">Nog geen pakketten beschikbaar.</p>
          )}
        </div>

        <p className="mt-8 text-xs text-brand/40">
          Betalen via Stripe. Sessies worden direct bijgeschreven na betaling en zijn 6 maanden geldig.
          Abonnementen (maandelijks, automatisch verlengd) komen binnenkort.
        </p>
      </div>
    </main>
  );
}
