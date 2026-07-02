import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/PrintButton";
import Invoice from "@/components/Invoice";
import { COACH_VAT_RATE, COACH_VAT_NOTE } from "@/lib/invoice";

export const dynamic = "force-dynamic";

const MEMBER_VAT_RATE = 0.06; // sportdiensten aan leden
const fmtDate = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const fmtShort = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const KIND = { booking: "Sessie", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessietegoed" };

// Printable invoice (→ Save as PDF). Modes:
//   ?payment=<id>             → factuur voor één betaling (coach-sessietegoed = B2B met btw-nr)
//   ?coach=<id>&month=YYYY-MM → maandfactuur voor de invoice-sessies van een coach
export default async function FactuurPage({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym: gymRow, supabase } = ctx;
  const sp = (await searchParams) || {};
  const admin = createAdminClient();
  // IBAN moved to gym_integrations (0102) — merge it back onto the gym object the Invoice expects.
  const { getGymSecrets } = await import("@/lib/gym-secrets");
  const gym = { ...gymRow, iban: (await getGymSecrets(admin, gymRow.id)).iban || gymRow.iban };

  let props = null;

  if (sp.payment) {
    const { data: p } = await admin
      .from("payments")
      .select("id, amount_cents, kind, description, created_at, user_id, member:profiles!payments_user_id_fkey(full_name, email, role, bill_company, bill_vat, bill_address)")
      .eq("id", sp.payment).eq("gym_id", gym.id).single();
    if (!p) return <Missing />;
    const { data: assignedNo } = await supabase.rpc("assign_invoice_no", { p_payment: sp.payment });
    const number = assignedNo || "F-" + String(p.id).slice(0, 8).toUpperCase();
    const m = p.member || {};
    const isCoachCredits = p.kind === "coach_credits";
    if (isCoachCredits) {
      const qty = Math.max(1, Math.round((p.amount_cents || 0) / 1200)); // €12/sessie
      props = {
        title: "Factuur", number, dateLabel: fmtDate(p.created_at), supplyLabel: fmtShort(p.created_at),
        billTo: { name: m.full_name || "Coach", company: m.bill_company, vat: m.bill_vat, address: m.bill_address, email: m.email },
        lines: [{ desc: "Coach-sessietegoed (€ 12,00 / sessie)", sub: fmtShort(p.created_at), qty, gross: p.amount_cents || 0 }],
        vatRate: COACH_VAT_RATE, vatNote: COACH_VAT_NOTE,
      };
    } else {
      props = {
        title: "Factuur", number, dateLabel: fmtDate(p.created_at), supplyLabel: fmtShort(p.created_at),
        billTo: { name: m.full_name || "Lid", email: m.email },
        lines: [{ desc: p.description || KIND[p.kind] || "Dienst", sub: fmtShort(p.created_at), qty: 1, gross: p.amount_cents || 0 }],
        vatRate: MEMBER_VAT_RATE, vatNote: gym.invoice_footer || "Sportvereniging zonder winstoogmerk — 6% btw op sportdiensten.",
      };
    }
  } else if (sp.coach) {
    const month = sp.month || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()).slice(0, 7);
    const [y, mo] = month.split("-").map(Number);
    const start = new Date(y, mo - 1, 1), end = new Date(y, mo, 1);
    const [{ data: coach }, { data: bookings }] = await Promise.all([
      admin.from("profiles").select("full_name, email, bill_company, bill_vat, bill_address").eq("id", sp.coach).single(),
      admin.from("bookings").select("starts_at, coach_charge_cents, services(name), member:profiles!bookings_user_id_fkey(full_name)")
        .eq("gym_id", gym.id).eq("coach_id", sp.coach).eq("coach_billing", "invoice").eq("status", "bevestigd")
        .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    ]);
    if (!coach) return <Missing />;
    props = {
      title: "Factuur — coachsessies",
      number: "C-" + String(sp.coach).slice(0, 6).toUpperCase() + "-" + month.replace("-", ""),
      dateLabel: fmtDate(end.toISOString()), supplyLabel: `Periode ${new Intl.DateTimeFormat("nl-BE", { month: "long", year: "numeric" }).format(start)}`,
      billTo: { name: coach.full_name || "Coach", company: coach.bill_company, vat: coach.bill_vat, address: coach.bill_address, email: coach.email },
      lines: (bookings || []).map((b) => ({ desc: `${b.services?.name || "Sessie"} — ${b.member?.full_name || "client"}`, sub: fmtShort(b.starts_at), qty: 1, gross: b.coach_charge_cents || 0 })),
      vatRate: COACH_VAT_RATE, vatNote: COACH_VAT_NOTE,
    };
  } else {
    return <Missing msg="Geen factuur opgegeven." />;
  }

  return (
    <div className="px-8 py-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/beheer/betalingen" className="text-sm font-semibold text-brand/50 hover:text-brand">← Betalingen</Link>
        <PrintButton />
      </div>
      <Invoice gym={gym} {...props} />
    </div>
  );
}

function Missing({ msg = "Niet gevonden." }) {
  return <div className="px-8 py-8">{msg} <Link href="/beheer/betalingen" className="text-accentdark">Terug</Link></div>;
}
