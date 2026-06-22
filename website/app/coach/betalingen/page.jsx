import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export default async function CoachBetalingen() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const admin = createAdminClient();
  const [{ data: pays }, { data: ledger }] = await Promise.all([
    admin.from("payments").select("amount_cents, kind, description, created_at").eq("user_id", userId).eq("kind", "coach_credits").order("created_at", { ascending: false }).limit(300),
    supabase.from("coach_ledger").select("delta").eq("coach_id", userId),
  ]);
  const purchases = pays || [];
  const balance = (ledger || []).reduce((a, r) => a + r.delta, 0);
  const total = purchases.reduce((a, p) => a + p.amount_cents, 0);
  const month = purchases.filter((p) => p.created_at >= monthStart).reduce((a, p) => a + p.amount_cents, 0);

  return (
    <div className="px-8 py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Betalingen</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand/50">
        Je betalingen aan Fittin: aankopen van <b>sessietegoed (€ 12 / sessie)</b> waarmee je je clienten in de zaal boekt.
        Wat je clienten jóu betalen, reken je rechtstreeks af (bv. Bancontact) — dat loopt niet via het platform.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Sessietegoed (saldo)" value={balance} accent={balance <= 2} />
        <Stat label="Gekocht (deze maand)" value={euro(month)} />
        <Stat label="Gekocht (totaal)" value={euro(total)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent bg-accent/5 p-5">
        <p className="text-sm font-semibold text-brand/70">Sessietegoed bijkopen? Dat doe je op je dashboard.</p>
        <Link href="/coach#boeken" className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">Naar dashboard →</Link>
      </div>

      <h2 className="mt-8 text-lg font-black text-brand">Aankoopgeschiedenis</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Datum</th>
              <th className="px-5 py-3">Omschrijving</th>
              <th className="px-5 py-3 text-right">Bedrag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {purchases.map((p, i) => (
              <tr key={i}>
                <td className="px-5 py-3 text-brand/60">{fmt(p.created_at)}</td>
                <td className="px-5 py-3 font-semibold text-brand">{p.description || "Sessietegoed gekocht"}</td>
                <td className="px-5 py-3 text-right font-black text-brand">{euro(p.amount_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 && <p className="p-6 text-sm text-brand/50">Nog geen aankopen — koop sessietegoed via je dashboard.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
    </div>
  );
}
