import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const VAT_RATE = 0.06; // BE sport non-profit
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const splitVat = (gross) => {
  const net = Math.round(gross / (1 + VAT_RATE));
  return { net, vat: gross - net, gross };
};
const fmtDate = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const fmtShort = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

// Printable invoice (→ Save as PDF). Two modes:
//   ?payment=<id>            → invoice for a single member payment
//   ?coach=<id>&month=YYYY-MM → monthly invoice for a coach's invoice-billed sessions
export default async function FactuurPage({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym, supabase } = ctx;
  const sp = (await searchParams) || {};
  const admin = createAdminClient();

  let title = "";
  let number = "";
  let billTo = { name: "", email: "", sub: "" };
  let dateLabel = fmtDate(new Date().toISOString());
  let lines = []; // [{ desc, sub, gross }]

  if (sp.payment) {
    const { data: p } = await admin
      .from("payments")
      .select("id, amount_cents, kind, description, created_at, member:profiles!payments_user_id_fkey(full_name, email)")
      .eq("id", sp.payment)
      .eq("gym_id", gym.id)
      .single();
    if (!p) return <Missing />;
    title = "Factuur";
    // Assign (once) a sequential, gap-free invoice number — required for BE VAT.
    const { data: assignedNo } = await supabase.rpc("assign_invoice_no", { p_payment: sp.payment });
    number = assignedNo || "F-" + String(p.id).slice(0, 8).toUpperCase();
    dateLabel = fmtDate(p.created_at);
    billTo = { name: p.member?.full_name || "Lid", email: p.member?.email || "", sub: "" };
    lines = [{ desc: p.description || ({ booking: "Sessie", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessies" }[p.kind] || "Dienst"), sub: fmtShort(p.created_at), gross: p.amount_cents || 0 }];
  } else if (sp.coach) {
    const month = sp.month || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()).slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    const [{ data: coach }, { data: bookings }] = await Promise.all([
      admin.from("profiles").select("full_name, email").eq("id", sp.coach).single(),
      admin
        .from("bookings")
        .select("starts_at, coach_charge_cents, services(name), member:profiles!bookings_user_id_fkey(full_name)")
        .eq("gym_id", gym.id)
        .eq("coach_id", sp.coach)
        .eq("coach_billing", "invoice")
        .eq("status", "bevestigd")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at"),
    ]);
    if (!coach) return <Missing />;
    title = "Factuur — coachsessies";
    number = "C-" + String(sp.coach).slice(0, 6).toUpperCase() + "-" + month.replace("-", "");
    dateLabel = fmtDate(end.toISOString());
    billTo = { name: coach.full_name || "Coach", email: coach.email || "", sub: `Periode ${new Intl.DateTimeFormat("nl-BE", { month: "long", year: "numeric" }).format(start)}` };
    lines = (bookings || []).map((b) => ({ desc: `${b.services?.name || "Sessie"} — ${b.member?.full_name || "client"}`, sub: fmtShort(b.starts_at), gross: b.coach_charge_cents || 0 }));
  } else {
    return <Missing msg="Geen factuur opgegeven." />;
  }

  const grossTotal = lines.reduce((a, l) => a + l.gross, 0);
  const { net, vat } = splitVat(grossTotal);

  return (
    <div className="px-8 py-8">
      <div className="print:hidden mb-4 flex items-center justify-between">
        <Link href="/beheer/betalingen" className="text-sm font-semibold text-brand/50 hover:text-brand">← Betalingen</Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl border border-borderc bg-white p-10 print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-2xl font-black text-brand">{gym.legal_name || gym.name}</p>
            {gym.address && <p className="mt-1 whitespace-pre-line text-sm text-brand/60">{gym.address}</p>}
            <p className="mt-1 text-sm text-brand/60">{gym.vat_number ? `Ondernemingsnr. ${gym.vat_number}` : "Ondernemingsnr. —"}</p>
            {gym.iban && <p className="text-sm text-brand/60">IBAN {gym.iban}</p>}
            {gym.invoice_email && <p className="text-sm text-brand/60">{gym.invoice_email}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-brand">{title}</p>
            <p className="mt-1 text-sm text-brand/60">Nr. {number}</p>
            <p className="text-sm text-brand/60">Datum: {dateLabel}</p>
          </div>
        </div>

        {/* Bill to */}
        <div className="mt-8 rounded-xl bg-paper p-4 print:bg-transparent print:p-0">
          <p className="text-xs font-bold uppercase tracking-widest text-lav">Factuur aan</p>
          <p className="mt-1 font-bold text-brand">{billTo.name}</p>
          {billTo.email && <p className="text-sm text-brand/60">{billTo.email}</p>}
          {billTo.sub && <p className="text-sm text-brand/60">{billTo.sub}</p>}
        </div>

        {/* Lines */}
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-borderc text-left text-xs uppercase tracking-wide text-lav">
              <th className="pb-2">Omschrijving</th>
              <th className="pb-2 text-right">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-borderc/60">
                <td className="py-2">
                  <span className="font-semibold text-brand">{l.desc}</span>
                  {l.sub && <span className="block text-xs text-brand/50">{l.sub}</span>}
                </td>
                <td className="py-2 text-right tabular-nums text-brand">{euro(l.gross)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={2} className="py-4 text-center text-brand/50">Geen sessies in deze periode.</td></tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Netto (excl. btw)" value={euro(net)} />
          <Row label="Btw 6%" value={euro(vat)} />
          <div className="mt-1 flex items-center justify-between border-t border-borderc pt-2 text-base font-black text-brand">
            <span>Totaal</span><span className="tabular-nums">{euro(grossTotal)}</span>
          </div>
        </div>

        <p className="mt-8 text-xs text-brand/50">{gym.invoice_footer || "Sportvereniging zonder winstoogmerk — 6% btw van toepassing op sportdiensten."}</p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-brand/70">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
function Missing({ msg = "Niet gevonden." }) {
  return <div className="px-8 py-8">{msg} <Link href="/beheer/betalingen" className="text-accentdark">Terug</Link></div>;
}
