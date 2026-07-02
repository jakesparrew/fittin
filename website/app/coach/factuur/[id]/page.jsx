import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/PrintButton";
import Invoice from "@/components/Invoice";
import { COACH_VAT_RATE, COACH_VAT_NOTE } from "@/lib/invoice";

export const dynamic = "force-dynamic";
const fmtDate = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const fmtShort = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

// A coach downloads the Belgian B2B invoice for their OWN session-credit purchase.
export default async function CoachFactuur({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/coach/betalingen");

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("payments")
    .select("id, amount_cents, kind, created_at, user_id, gym_id, member:profiles!payments_user_id_fkey(full_name, email, bill_company, bill_vat, bill_address)")
    .eq("id", id).single();
  if (!p || p.user_id !== user.id) return <Missing />; // only your own payment

  const { data: gymRow } = await admin.from("gyms").select("*").eq("id", p.gym_id).single();
  const { getGymSecrets } = await import("@/lib/gym-secrets");
  const gym = { ...gymRow, iban: (await getGymSecrets(admin, p.gym_id)).iban || gymRow?.iban }; // IBAN moved to gym_integrations (0102)
  // Assign (once) the gap-free invoice number via the coach's own session (auth.uid() = coach).
  const { data: assignedNo } = await supabase.rpc("assign_invoice_no", { p_payment: id });
  const number = assignedNo || "F-" + String(p.id).slice(0, 8).toUpperCase();
  const m = p.member || {};
  const qty = Math.max(1, Math.round((p.amount_cents || 0) / 1200));

  return (
    <div className="px-4 py-8 md:px-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/coach/betalingen" className="text-sm font-semibold text-brand/50 hover:text-brand">← Betalingen</Link>
        <PrintButton />
      </div>
      {(!m.bill_company || !m.bill_vat) && (
        <p className="mx-auto mb-4 max-w-2xl rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-800 print:hidden">
          Vul je <Link href="/coach/profiel" className="underline">facturatiegegevens</Link> (bedrijfsnaam + btw-nummer) aan voor een volledige B2B-factuur.
        </p>
      )}
      <Invoice
        gym={gym} title="Factuur" number={number}
        dateLabel={fmtDate(p.created_at)} supplyLabel={fmtShort(p.created_at)}
        billTo={{ name: m.full_name || "Coach", company: m.bill_company, vat: m.bill_vat, address: m.bill_address, email: m.email }}
        lines={[{ desc: "Coach-sessietegoed (€ 12,00 / sessie)", sub: fmtShort(p.created_at), qty, gross: p.amount_cents || 0 }]}
        vatRate={COACH_VAT_RATE} vatNote={COACH_VAT_NOTE}
      />
    </div>
  );
}

function Missing() {
  return <div className="px-8 py-8 text-sm text-brand/60">Factuur niet gevonden. <Link href="/coach/betalingen" className="text-accentdark">Terug</Link></div>;
}
