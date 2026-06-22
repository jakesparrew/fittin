import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const KIND = { booking: "Sessie", beurtenkaart: "10-beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessietegoed", overig: "Aankoop" };

// Member payment history + downloadable Stripe receipts (betaalbewijzen).
export default async function AccountBetalingen() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/betalingen");

  const admin = createAdminClient(); // payments are admin-scoped; we read only this user's rows
  const { data: pays } = await admin
    .from("payments")
    .select("amount_cents, kind, description, created_at, receipt_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const payments = pays || [];
  const total = payments.reduce((a, p) => a + (p.amount_cents || 0), 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <Link href="/account" className="text-sm font-semibold text-brand/50 hover:text-brand">← Mijn account</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Betalingen &amp; betaalbewijzen</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand/60">Al je betalingen aan Fittin. Klik op <b>Download</b> voor je betaalbewijs van Stripe (abonnement = link naar je factuur).</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Datum</th>
              <th className="px-5 py-3">Omschrijving</th>
              <th className="px-5 py-3 text-right">Bedrag</th>
              <th className="px-5 py-3 text-right">Betaalbewijs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {payments.map((p, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-5 py-3 text-brand/60">{fmt(p.created_at)}</td>
                <td className="px-5 py-3 font-semibold text-brand">{p.description || KIND[p.kind] || "Betaling"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-black text-brand">{euro(p.amount_cents)}</td>
                <td className="px-5 py-3 text-right">{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-accentdark hover:underline">Download →</a> : <span className="text-xs text-brand/30">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="p-6 text-sm text-brand/50">Nog geen betalingen.</p>}
      </div>
      {payments.length > 0 && <p className="mt-3 text-right text-sm text-brand/60">Totaal betaald: <span className="font-black text-brand">{euro(total)}</span></p>}
      <p className="mt-6 text-xs text-brand/40">Een officiële factuur (met btw) nodig? Vraag ze aan via <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.</p>
    </div>
  );
}
