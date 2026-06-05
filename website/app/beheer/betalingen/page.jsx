import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { saveInvoiceSettings } from "./actions";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const KIND = { booking: "Boeking", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessies", overig: "Overig" };
const TABS = [
  { v: "", l: "Alles" },
  { v: "booking", l: "Boekingen" },
  { v: "beurtenkaart", l: "Beurtenkaarten" },
  { v: "abonnement", l: "Abonnementen" },
  { v: "coach_credits", l: "Coach-sessies" },
];

export default async function Betalingen({ searchParams }) {
  const sp = await searchParams;
  const filter = sp?.kind || "";
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let q = supabase
    .from("payments")
    .select("id, amount_cents, kind, description, created_at, status, member:profiles!payments_user_id_fkey(id, full_name, email)")
    .eq("gym_id", gym.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter) q = q.eq("kind", filter);
  const { data: rows } = await q;

  const { data: monthRows } = await supabase.from("payments").select("amount_cents, created_at").eq("gym_id", gym.id).gte("created_at", monthStart.toISOString());
  const monthTotal = (monthRows || []).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const todayTotal = (monthRows || []).filter((p) => new Date(p.created_at) >= dayStart).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const shownTotal = (rows || []).reduce((a, p) => a + (p.amount_cents || 0), 0);

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Betalingen</h1>
          <p className="mt-1 text-sm text-brand/50">Alle Stripe-betalingen van je leden en coaches.</p>
        </div>
        <a
          href={`/beheer/betalingen/export${filter ? `?kind=${filter}` : ""}`}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
        >
          ⬇ Exporteer CSV
        </a>
      </div>

      {/* Invoice / non-profit billing details (used on generated invoices) */}
      <details className="mt-4 rounded-2xl border border-borderc bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-brand">Factuurgegevens (vzw · 6% btw)</summary>
        <form action={saveInvoiceSettings} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field name="legal_name" label="Wettelijke naam (vzw)" defaultValue={gym.legal_name} />
          <Field name="vat_number" label="Ondernemings-/btw-nummer" defaultValue={gym.vat_number} placeholder="BE0123.456.789" />
          <Field name="iban" label="IBAN" defaultValue={gym.iban} />
          <Field name="invoice_email" label="Facturatie-e-mail" defaultValue={gym.invoice_email} />
          <Field name="invoice_footer" label="Voetnoot op factuur" defaultValue={gym.invoice_footer} full />
          <div className="sm:col-span-2">
            <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">Opslaan</button>
          </div>
        </form>
      </details>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Vandaag" value={euro(todayTotal)} />
        <Stat label="Deze maand" value={euro(monthTotal)} />
        <Stat label={filter ? `Getoond (${KIND[filter] || filter})` : "Getoond (laatste 200)"} value={euro(shownTotal)} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={t.v ? `/beheer/betalingen?kind=${t.v}` : "/beheer/betalingen"}
            className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (filter === t.v ? "bg-brand text-white" : "bg-paper text-brand/60 hover:bg-accent/15")}
          >
            {t.l}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Lid</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Omschrijving</th>
              <th className="px-5 py-3 text-right">Bedrag</th>
              <th className="px-5 py-3 text-right">Datum</th>
              <th className="px-5 py-3 text-right">Factuur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {(rows || []).map((p, i) => (
              <tr key={i}>
                <td className="px-5 py-3">
                  {p.member ? (
                    <Link href={`/beheer/leden/${p.member.id}`} className="font-bold text-brand hover:text-accentdark">{p.member.full_name || p.member.email}</Link>
                  ) : (
                    <span className="text-brand/40">Verwijderd lid</span>
                  )}
                </td>
                <td className="px-5 py-3"><span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-brand/70">{KIND[p.kind] || p.kind}</span></td>
                <td className="px-5 py-3 text-brand/50">{p.description || "—"}</td>
                <td className="px-5 py-3 text-right font-black text-brand">{euro(p.amount_cents)}</td>
                <td className="px-5 py-3 text-right text-xs text-brand/40">{fmt(p.created_at)}</td>
                <td className="px-5 py-3 text-right"><Link href={`/beheer/factuur?payment=${p.id}`} className="text-xs font-bold text-accentdark hover:underline">Factuur →</Link></td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-brand/40">Nog geen betalingen. Ze verschijnen hier automatisch zodra Stripe ze bevestigt.</td></tr>
            )}
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
function Field({ name, label, defaultValue, placeholder, full }) {
  return (
    <label className={"block " + (full ? "sm:col-span-2" : "")}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}
