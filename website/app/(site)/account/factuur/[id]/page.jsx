import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/PrintButton";
import Invoice from "@/components/Invoice";

export const dynamic = "force-dynamic";
const MEMBER_VAT_RATE = 0.06; // 6% incl. (alle prijzen zijn inclusief btw)
const fmtDate = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const fmtShort = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const KIND = { booking: "Sessie", beurtenkaart: "10-beurtenkaart", abonnement: "Abonnement", overig: "Aankoop", coach_credits: "Coach-sessietegoed" };

// A member/client downloads the invoice for their OWN payment (on company name if billing details set).
export default async function MemberFactuur({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/betalingen");

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("payments")
    .select("id, amount_cents, kind, description, created_at, user_id, gym_id, member:profiles!payments_user_id_fkey(full_name, email, bill_company, bill_vat, bill_address)")
    .eq("id", id).single();
  if (!p || p.user_id !== user.id) return <Missing />; // only your own payment

  const { data: gym } = await admin.from("gyms").select("*").eq("id", p.gym_id).single();
  const { data: assignedNo } = await supabase.rpc("assign_invoice_no", { p_payment: id });
  const number = assignedNo || "F-" + String(p.id).slice(0, 8).toUpperCase();
  const m = p.member || {};

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/account/betalingen" className="text-sm font-semibold text-brand/50 hover:text-brand">← Betalingen</Link>
        <PrintButton />
      </div>
      <Invoice
        gym={gym} title="Factuur" number={number}
        dateLabel={fmtDate(p.created_at)} supplyLabel={fmtShort(p.created_at)}
        billTo={{ name: m.full_name || "Klant", company: m.bill_company, vat: m.bill_vat, address: m.bill_address, email: m.email }}
        lines={[{ desc: p.description || KIND[p.kind] || "Dienst", sub: fmtShort(p.created_at), qty: 1, gross: p.amount_cents || 0 }]}
        vatRate={MEMBER_VAT_RATE} vatNote="Bedragen zijn inclusief 6% btw. Sportvereniging zonder winstoogmerk."
      />
    </div>
  );
}

function Missing() {
  return <div className="px-6 py-10 text-sm text-brand/60">Factuur niet gevonden. <Link href="/account/betalingen" className="text-accentdark">Terug</Link></div>;
}
