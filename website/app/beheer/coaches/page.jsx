import { getAdminContext } from "@/lib/admin";
import { addCoachAvailability, deleteCoachAvailability } from "../coaching-actions";
import { setCoachBilling, grantCoachCredits } from "../actions";

export const dynamic = "force-dynamic";
const WD_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const eur = (c) => (c / 100).toFixed(2).replace(".", ",");

export default async function Coaches() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [{ data: coaches }, { data: avail }, { data: ledger }, { data: charges }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, coach_billing_mode, coach_session_price_cents").eq("gym_id", gym.id).eq("role", "coach").order("full_name"),
    supabase.from("coach_availability").select("*").eq("gym_id", gym.id).order("weekday"),
    supabase.from("coach_ledger").select("coach_id, delta").eq("gym_id", gym.id),
    supabase.from("bookings").select("coach_id, coach_charge_cents, coach_billing, starts_at, status").eq("gym_id", gym.id).eq("coach_billing", "invoice").gte("starts_at", monthStart.toISOString()),
  ]);

  const byCoach = {};
  for (const a of avail || []) (byCoach[a.coach_id] ||= []).push(a);
  const balance = {};
  for (const r of ledger || []) balance[r.coach_id] = (balance[r.coach_id] || 0) + r.delta;
  const invoice = {};
  for (const b of charges || []) if (b.status === "bevestigd") invoice[b.coach_id] = (invoice[b.coach_id] || 0) + (b.coach_charge_cents || 0);

  const hours = [];
  for (let h = gym.open_hour; h <= gym.close_hour; h++) hours.push(h);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Coaches</h1>
      <p className="mt-1 text-sm text-brand/50">Facturatie, sessietegoed en beschikbaarheid per coach.</p>

      <div className="mt-6 space-y-5">
        {(coaches || []).map((c) => (
          <div key={c.id} className="rounded-2xl border border-borderc bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-black text-brand">{c.full_name || c.email}</p>
              <div className="flex gap-2 text-xs font-bold">
                <span className="rounded-full bg-paper px-3 py-1 text-brand/60">Saldo: {balance[c.id] || 0} sessies</span>
                <span className="rounded-full bg-paper px-3 py-1 text-brand/60">Te factureren: {euro(invoice[c.id] || 0)}</span>
              </div>
            </div>

            {/* Billing config */}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <form action={setCoachBilling} className="flex flex-wrap items-end gap-2 rounded-xl bg-paper p-4">
                <input type="hidden" name="coachId" value={c.id} />
                <Lbl t="Facturatie">
                  <select name="mode" defaultValue={c.coach_billing_mode} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
                    <option value="free">Gratis</option>
                    <option value="credit">Sessietegoed</option>
                    <option value="invoice">Maandfactuur</option>
                  </select>
                </Lbl>
                <Lbl t="Tarief/sessie (€)"><input name="price_eur" defaultValue={eur(c.coach_session_price_cents)} className="w-24 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
                <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Opslaan</button>
              </form>

              <form action={grantCoachCredits} className="flex flex-wrap items-end gap-2 rounded-xl bg-paper p-4">
                <input type="hidden" name="coachId" value={c.id} />
                <Lbl t="Sessietegoed ±"><input name="delta" type="number" placeholder="bv. 10" className="w-24 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
                <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Toekennen</button>
              </form>
            </div>

            {/* Availability */}
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-lav">Beschikbaarheid</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(byCoach[c.id] || []).map((a) => (
                <span key={a.id} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">
                  {WD_FULL[a.weekday].slice(0, 2)} {a.from_hour}:00–{a.to_hour}:00
                  <form action={deleteCoachAvailability} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="text-red-500 hover:underline">×</button>
                  </form>
                </span>
              ))}
              {(byCoach[c.id] || []).length === 0 && <span className="text-xs text-brand/40">Geen beschikbaarheid.</span>}
            </div>
            <form action={addCoachAvailability} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="coachId" value={c.id} />
              <Lbl t="Dag"><select name="weekday" className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{WD_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Lbl>
              <Lbl t="Van"><select name="from_hour" defaultValue={9} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
              <Lbl t="Tot"><select name="to_hour" defaultValue={18} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
              <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Beschikbaarheid</button>
            </form>
          </div>
        ))}
        {(!coaches || coaches.length === 0) && (
          <p className="rounded-xl bg-accent/10 p-4 text-sm font-semibold text-accentdark">Nog geen coaches. Zet een lid op rol "coach" via Leden.</p>
        )}
      </div>
    </div>
  );
}

function Lbl({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
