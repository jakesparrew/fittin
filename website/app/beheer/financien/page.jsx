import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGymSecrets } from "@/lib/gym-secrets";
import { invoiceCoachSessions, markPaymentPaid, createManualInvoice } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import PrintButton from "@/components/admin/PrintButton";
import SearchSelect from "@/components/admin/SearchSelect";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmtDay = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const MAAND = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const KIND = { booking: "Sessies", beurtenkaart: "Beurtenkaarten", abonnement: "Abonnementen", coach_credits: "Coach-sessies", overig: "Overig" };

// Boekhoudkundig overzicht: wat kwam er binnen, waaruit, wat staat nog open, en wat moet
// nog gefactureerd worden. Alles per maand, met btw-splitsing (vzw · 6%) en een print/PDF-knop.
export default async function Financien({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const sp = (await searchParams) || {};
  const admin = createAdminClient();

  const now = new Date();
  // ?m=0 = deze maand, 1 = vorige, … (max 24 terug)
  const back = Math.min(24, Math.max(0, parseInt(sp.m || "0", 10) || 0));
  const from = new Date(now.getFullYear(), now.getMonth() - back, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
  const jaar = sp.jaar === "1"; // heel kalenderjaar i.p.v. één maand
  const periodFrom = jaar ? new Date(from.getFullYear(), 0, 1) : from;
  const periodTo = jaar ? new Date(from.getFullYear() + 1, 0, 1) : to;

  const [{ data: pays }, { data: invoiceRows }, { data: coachLedger }, secrets, { data: people }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount_cents, kind, description, status, created_at, invoice_no, member:profiles!payments_user_id_fkey(id, full_name, email)")
      .eq("gym_id", gym.id)
      .gte("created_at", periodFrom.toISOString())
      .lt("created_at", periodTo.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    // Nog te factureren coach-sessies ("op factuur"-modus) — reeds gebeurd, nog niet gefactureerd.
    supabase
      .from("bookings")
      .select("id, coach_id, starts_at, coach_charge_cents, coach:profiles!bookings_coach_id_fkey(full_name, email)")
      .eq("gym_id", gym.id)
      .eq("coach_billing", "invoice")
      .eq("status", "bevestigd")
      .is("coach_invoiced_at", null)
      .lte("starts_at", now.toISOString())
      .order("starts_at"),
    supabase.from("coach_ledger").select("coach_id, delta").eq("gym_id", gym.id),
    getGymSecrets(admin, gym.id),
    supabase.from("profiles").select("id, full_name, email, role").eq("gym_id", gym.id).order("full_name"),
  ]);

  const rows = pays || [];
  const betaald = rows.filter((p) => (p.status || "betaald") === "betaald" || p.status === "paid");
  const open = rows.filter((p) => p.status === "onbetaald");
  const totaal = betaald.reduce((a, p) => a + (p.amount_cents || 0), 0);
  const openTotaal = open.reduce((a, p) => a + (p.amount_cents || 0), 0);

  // Btw-splitsing: bedragen zijn inclusief 6% (vzw · sport). Excl = incl / 1,06.
  const btwPct = 6;
  const exclusief = Math.round(totaal / (1 + btwPct / 100));
  const btw = totaal - exclusief;

  const perKind = {};
  for (const p of betaald) perKind[p.kind] = (perKind[p.kind] || 0) + (p.amount_cents || 0);

  // Te factureren coach-sessies, gegroepeerd per coach.
  const perCoach = {};
  for (const b of invoiceRows || []) {
    const k = b.coach_id;
    (perCoach[k] ||= { naam: b.coach?.full_name || "Coach", email: b.coach?.email, n: 0, cents: 0, eerste: b.starts_at, laatste: b.starts_at });
    perCoach[k].n++;
    perCoach[k].cents += b.coach_charge_cents || 0;
    perCoach[k].laatste = b.starts_at;
  }
  const teFactureren = Object.entries(perCoach);
  const teFactureenTotaal = teFactureren.reduce((a, [, v]) => a + v.cents, 0);

  // Coaches met een negatief sessietegoed = nog te innen (ze boekten meer dan ze kochten).
  const coachBal = {};
  for (const r of coachLedger || []) coachBal[r.coach_id] = (coachBal[r.coach_id] || 0) + (r.delta || 0);

  const label = jaar ? String(from.getFullYear()) : `${MAAND[from.getMonth()]} ${from.getFullYear()}`;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      {/* Print-only kop met de wettelijke gegevens — zo is de PDF meteen bruikbaar voor de boekhouder. */}
      <div className="hidden print:mb-6 print:block">
        <p className="text-xl font-black text-brand">{gym.legal_name || gym.name || "Fittin'"}</p>
        <p className="text-xs text-brand/60">
          {gym.vat_number ? `Ondernemingsnr. ${gym.vat_number} · ` : ""}{gym.address || ""}
          {secrets?.iban ? ` · IBAN ${secrets.iban}` : ""}
        </p>
        <p className="mt-1 text-sm font-bold text-brand">Financieel overzicht — {label}</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-black text-brand">Financiën</h1>
          <p className="mt-1 text-sm text-brand/50">Alles voor je boekhouding: ontvangsten, btw, open posten en nog te factureren coach-sessies.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/beheer/betalingen/export`} className="rounded-full border-2 border-borderc px-4 py-2 text-sm font-bold text-brand transition hover:border-lav">⬇ CSV (alles)</a>
          <PrintButton label="⬇ PDF / afdrukken" />
        </div>
      </div>

      {/* Periodekiezer */}
      <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/beheer/financien?m=${back + 1}`} className="rounded-full border-2 border-borderc px-3 py-1.5 text-sm font-bold hover:border-lav">←</Link>
        <span className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold capitalize text-white">{label}</span>
        {back > 0 && <Link href={`/beheer/financien?m=${back - 1}`} className="rounded-full border-2 border-borderc px-3 py-1.5 text-sm font-bold hover:border-lav">→</Link>}
        <Link href={jaar ? `/beheer/financien?m=${back}` : `/beheer/financien?m=${back}&jaar=1`} className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (jaar ? "bg-accent text-brand" : "border-2 border-borderc text-brand/60 hover:border-lav")}>
          {jaar ? "✓ Heel jaar" : "Heel jaar"}
        </Link>
      </div>

      {/* Kerncijfers */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ontvangen" value={euro(totaal)} sub={`${betaald.length} betalingen`} accent />
        <Kpi label={`Excl. btw (${btwPct}%)`} value={euro(exclusief)} sub="maatstaf van heffing" />
        <Kpi label="Btw-bedrag" value={euro(btw)} sub={`${btwPct}% · vzw sport`} />
        <Kpi label="Nog te ontvangen" value={euro(openTotaal + teFactureenTotaal)} sub={`${open.length} open post(en) + ${teFactureren.length} coach(es)`} warn={openTotaal + teFactureenTotaal > 0} />
      </div>

      {/* Zelf een factuur opmaken — vrije post voor alles wat niet via Stripe loopt
          (bv. sponsoring, verhuur van de zaal, een aparte afspraak met een coach of lid). */}
      <details className="mt-6 rounded-2xl border-2 border-accent bg-accent/5 p-5 print:hidden">
        <summary className="cursor-pointer text-sm font-black text-brand">🧾 Nieuwe factuur opmaken</summary>
        <p className="mt-2 text-xs text-brand/55">
          Kies voor wie, geef een omschrijving en het bedrag <b>incl. {btwPct}% btw</b>. De factuur verschijnt bij
          <b> Open posten</b> — daar genereer je de PDF (met automatisch volgnummer) en vink je "ontvangen" aan zodra betaald.
        </p>
        <ActionForm action={createManualInvoice} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Voor wie</span>
            <SearchSelect name="userId" required placeholder="Zoek lid of coach…" options={(people || []).map((p) => ({ value: p.id, label: `${p.full_name || p.email}${p.role !== "lid" ? ` (${p.role})` : ""}` }))} />
          </div>
          <label className="block flex-1 min-w-[14rem]">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Omschrijving (komt op de factuur)</span>
            <input name="description" required placeholder="bv. Verhuur zaal · 2u privéles · sponsoring" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Bedrag € (incl. btw)</span>
            <input name="amount_eur" required inputMode="decimal" placeholder="bv. 120,00" className="w-32 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">+ Maak factuur</button>
        </ActionForm>
      </details>

      {/* Omzet per soort */}
      <section className="mt-6 rounded-2xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Ontvangsten per soort — {label}</h2>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-borderc">
            {Object.entries(perKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <tr key={k}>
                <td className="py-2 font-semibold text-brand">{KIND[k] || k}</td>
                <td className="py-2 text-right text-xs text-brand/45">{Math.round((v / (totaal || 1)) * 100)}%</td>
                <td className="py-2 text-right font-black text-brand">{euro(v)}</td>
              </tr>
            ))}
            {Object.keys(perKind).length === 0 && <tr><td className="py-3 text-sm text-brand/40">Geen ontvangsten in deze periode.</td></tr>}
          </tbody>
          {Object.keys(perKind).length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-brand/20">
                <td className="pt-2 font-black text-brand">Totaal</td><td />
                <td className="pt-2 text-right font-black text-brand">{euro(totaal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* Nog te factureren coach-sessies ("op factuur"-coaches) */}
      <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-6 print:border-borderc print:bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-brand">Nog te factureren coach-sessies</h2>
            <p className="mt-0.5 text-sm text-brand/60">Sessies van coaches op <b>maandfactuur</b> die al plaatsvonden en nog niet gefactureerd zijn.</p>
          </div>
          <span className="text-2xl font-black text-brand">{euro(teFactureenTotaal)}</span>
        </div>
        {teFactureren.length === 0 ? (
          <p className="mt-3 text-sm text-brand/50">Niets openstaand — alle coach-sessies zijn gefactureerd. ✓</p>
        ) : (
          <div className="mt-4 space-y-2">
            {teFactureren.map(([cid, v]) => (
              <div key={cid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4">
                <div>
                  <p className="font-black text-brand">{v.naam}</p>
                  <p className="text-xs text-brand/50">{v.n} sessies · {fmtDay(v.eerste)} → {fmtDay(v.laatste)} · {euro(1200)}/sessie</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-brand">{euro(v.cents)}</span>
                  <ActionForm action={invoiceCoachSessions} success="Factuur opgemaakt ✓" className="print:hidden">
                    <input type="hidden" name="coachId" value={cid} />
                    <button className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90">Maak factuur op →</button>
                  </ActionForm>
                </div>
              </div>
            ))}
            <p className="text-xs text-brand/45 print:hidden">"Maak factuur op" zet het bedrag als open post bij Betalingen (waar je de factuur-PDF genereert) en markeert de sessies als gefactureerd.</p>
          </div>
        )}
      </section>

      {/* Open posten */}
      <section className="mt-6 rounded-2xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Open posten <span className="text-sm font-bold text-brand/40">({open.length})</span></h2>
        <p className="mt-0.5 text-sm text-brand/50">Gefactureerd maar nog niet ontvangen (overschrijving/cash).</p>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-brand/50">Alles is geïnd. ✓</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs font-bold uppercase tracking-wide text-lav">
              <tr><th className="py-2">Datum</th><th className="py-2">Wie</th><th className="py-2">Omschrijving</th><th className="py-2 text-right">Bedrag</th><th className="py-2 text-right print:hidden"></th></tr>
            </thead>
            <tbody className="divide-y divide-borderc">
              {open.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 whitespace-nowrap text-brand/60">{fmtDay(p.created_at)}</td>
                  <td className="py-2 font-semibold text-brand">{p.member?.full_name || "—"}</td>
                  <td className="py-2 text-brand/60">{p.description || KIND[p.kind] || p.kind}</td>
                  <td className="py-2 text-right font-black text-red-600">{euro(p.amount_cents)}</td>
                  <td className="py-2 text-right print:hidden">
                    <span className="inline-flex gap-2">
                      <Link href={`/beheer/factuur?payment=${p.id}`} className="text-xs font-bold text-accentdark hover:underline">Factuur</Link>
                      <ActionForm action={markPaymentPaid} success="Gemarkeerd als betaald ✓" className="inline">
                        <input type="hidden" name="paymentId" value={p.id} />
                        <button className="text-xs font-bold text-brand/60 hover:text-brand">✓ ontvangen</button>
                      </ActionForm>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Volledige transactielijst — de bijlage voor de boekhouder */}
      <section className="mt-6 rounded-2xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Alle transacties — {label}</h2>
        <p className="mt-0.5 text-sm text-brand/50 print:hidden">Bedragen zijn inclusief {btwPct}% btw.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-bold uppercase tracking-wide text-lav">
              <tr>
                <th className="py-2">Datum</th><th className="py-2">Wie</th><th className="py-2">Soort</th>
                <th className="py-2">Omschrijving</th><th className="py-2 text-right">Excl.</th>
                <th className="py-2 text-right">Btw</th><th className="py-2 text-right">Incl.</th><th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderc">
              {rows.map((p) => {
                const incl = p.amount_cents || 0;
                const ex = Math.round(incl / (1 + btwPct / 100));
                const isOpen = p.status === "onbetaald";
                const isRefund = p.status === "refunded" || p.status === "terugbetaald";
                return (
                  <tr key={p.id} className={isRefund ? "opacity-60" : ""}>
                    <td className="py-2 whitespace-nowrap text-brand/60">{fmtDay(p.created_at)}</td>
                    <td className="py-2 font-semibold text-brand">{p.member?.full_name || "—"}</td>
                    <td className="py-2 text-brand/60">{KIND[p.kind] || p.kind}</td>
                    <td className="py-2 text-brand/50">{p.description || "—"}</td>
                    <td className="py-2 text-right text-brand/60">{euro(ex)}</td>
                    <td className="py-2 text-right text-brand/60">{euro(incl - ex)}</td>
                    <td className={"py-2 text-right font-black " + (isRefund ? "text-brand/40 line-through" : "text-brand")}>{euro(incl)}</td>
                    <td className={"py-2 text-xs font-bold " + (isOpen ? "text-red-600" : isRefund ? "text-brand/40" : "text-accentdark")}>{isOpen ? "open" : isRefund ? "terugbetaald" : "betaald"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="py-4 text-sm text-brand/40">Geen transacties in deze periode.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-brand/20 font-black text-brand">
                  <td className="pt-2" colSpan={4}>Totaal ontvangen</td>
                  <td className="pt-2 text-right">{euro(exclusief)}</td>
                  <td className="pt-2 text-right">{euro(btw)}</td>
                  <td className="pt-2 text-right">{euro(totaal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-brand/40">
        Btw-berekening: alle bedragen zijn inclusief {btwPct}% (sport-tarief vzw). Controleer het toegepaste regime met je boekhouder —
        de app rekent enkel terug vanaf de ontvangen bedragen.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, accent, warn }) {
  return (
    <div className={"rounded-2xl border p-5 " + (warn ? "border-amber-300 bg-amber-50/60" : "border-borderc bg-white")}>
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (warn ? "text-amber-600" : accent ? "text-accentdark" : "text-brand")}>{value}</p>
      {sub && <p className="mt-1 text-xs text-brand/45">{sub}</p>}
    </div>
  );
}
