import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ActionForm from "@/components/ui/ActionForm";
import { saveBillingDetails } from "../actions";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const KIND = { booking: "Sessie", beurtenkaart: "10-beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessietegoed", overig: "Aankoop" };

// Member/client payment history: download a betaalbewijs (Stripe) or a Belgian invoice (ours, incl.
// 6% btw). Fill in billing details to get the invoice on a company name (B2B).
export default async function AccountBetalingen() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/betalingen");

  const admin = createAdminClient();
  const [{ data: pays }, { data: me }] = await Promise.all([
    admin.from("payments").select("id, amount_cents, kind, description, created_at, receipt_url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(300),
    admin.from("profiles").select("bill_company, bill_vat, bill_address").eq("id", user.id).single(),
  ]);
  const payments = pays || [];
  const total = payments.reduce((a, p) => a + (p.amount_cents || 0), 0);
  const hasBilling = !!(me?.bill_company || me?.bill_vat);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <Link href="/account" className="text-sm font-semibold text-brand/50 hover:text-brand">← Mijn account</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Betalingen &amp; facturen</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand/60">Download je <b>betaalbewijs</b> of een <b>factuur</b> per betaling. Wil je een factuur op je bedrijfsnaam (B2B)? Vul hieronder je gegevens in.</p>

      {/* Billing details — optional, for an invoice on a company name */}
      <details open={!hasBilling} className="mt-6 rounded-2xl border border-borderc bg-white p-5">
        <summary className="cursor-pointer text-sm font-bold text-brand">🏢 Facturatiegegevens {hasBilling ? "(ingevuld ✓)" : "(optioneel — voor een factuur op bedrijfsnaam)"}</summary>
        <ActionForm action={saveBillingDetails} success="Facturatiegegevens opgeslagen ✓" className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field name="bill_company" label="Bedrijfsnaam" defaultValue={me?.bill_company} placeholder="bv. Mijn BV" />
          <Field name="bill_vat" label="Btw-nummer" defaultValue={me?.bill_vat} placeholder="BE 0123.456.789" />
          <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Facturatieadres</span><textarea name="bill_address" rows={2} defaultValue={me?.bill_address || ""} placeholder="Straat 1, 9000 Gent" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></label>
          <div className="sm:col-span-2"><button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">Opslaan</button></div>
        </ActionForm>
      </details>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Datum</th>
              <th className="px-5 py-3">Omschrijving</th>
              <th className="px-5 py-3 text-right">Bedrag</th>
              <th className="px-5 py-3 text-right">Factuur</th>
              <th className="px-5 py-3 text-right">Bewijs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-5 py-3 text-brand/60">{fmt(p.created_at)}</td>
                <td className="px-5 py-3 font-semibold text-brand">{p.description || KIND[p.kind] || "Betaling"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-black text-brand">{euro(p.amount_cents)}</td>
                <td className="px-5 py-3 text-right"><a href={`/account/factuur/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-accentdark hover:underline">Factuur →</a></td>
                <td className="px-5 py-3 text-right">{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand/50 hover:underline">Download</a> : <span className="text-xs text-brand/30">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="p-6 text-sm text-brand/50">Nog geen betalingen.</p>}
      </div>
      {payments.length > 0 && <p className="mt-3 text-right text-sm text-brand/60">Totaal betaald: <span className="font-black text-brand">{euro(total)}</span></p>}
      <p className="mt-6 text-xs text-brand/40">Facturen zijn inclusief 6% btw. Vragen? <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.</p>
    </div>
  );
}

function Field({ name, label, defaultValue, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}
