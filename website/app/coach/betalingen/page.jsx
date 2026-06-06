import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { cancelCoachPaymentRequest } from "../actions";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function CoachBetalingen() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const { data: reqs } = await supabase
    .from("coach_payment_requests")
    .select("id, amount_cents, description, status, paid_at, created_at, client:profiles!coach_payment_requests_client_id_fkey(full_name, email)")
    .eq("coach_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);

  const all = reqs || [];
  const paid = all.filter((r) => r.status === "paid");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paidTotal = paid.reduce((a, r) => a + r.amount_cents, 0);
  const monthTotal = paid.filter((r) => r.paid_at && new Date(r.paid_at) >= monthStart).reduce((a, r) => a + r.amount_cents, 0);
  const pendingTotal = all.filter((r) => r.status === "pending").reduce((a, r) => a + r.amount_cents, 0);

  return (
    <div className="px-8 py-8">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-black text-brand">Mijn betalingen</h1>
          <p className="mt-1 text-sm text-brand/50">Alle betaalverzoeken aan je clienten. Exporteer voor je boekhouding.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/coach/betalingen/export" className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">⬇ CSV</a>
          <PrintButton label="Print / PDF" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Betaald (deze maand)" value={euro(monthTotal)} />
        <Stat label="Betaald (totaal)" value={euro(paidTotal)} />
        <Stat label="Openstaand" value={euro(pendingTotal)} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Omschrijving</th>
              <th className="px-5 py-3 text-right">Bedrag</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Datum</th>
              <th className="px-5 py-3 print:hidden"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {all.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-bold text-brand">{r.client?.full_name || r.client?.email || "—"}</td>
                <td className="px-5 py-3 text-brand/60">{r.description || "Sessie"}</td>
                <td className="px-5 py-3 text-right font-black text-brand">{euro(r.amount_cents)}</td>
                <td className="px-5 py-3">
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + (r.status === "paid" ? "bg-accent/15 text-accentdark" : r.status === "cancelled" ? "bg-paper text-brand/40" : "bg-paper text-brand/60")}>
                    {r.status === "paid" ? "betaald" : r.status === "cancelled" ? "geannuleerd" : "openstaand"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-xs text-brand/40">{fmt(r.paid_at || r.created_at)}</td>
                <td className="px-5 py-3 text-right print:hidden">
                  {r.status === "pending" && (
                    <form action={cancelCoachPaymentRequest}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-bold text-red-500 hover:underline">annuleer</button></form>
                  )}
                </td>
              </tr>
            ))}
            {all.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-brand/40">Nog geen betaalverzoeken. Stuur er een vanaf je clientenpagina.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-brand">{value}</p>
    </div>
  );
}
