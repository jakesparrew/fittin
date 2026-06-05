import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { addCoachAvailability, deleteCoachAvailability } from "../coaching-actions";
import { setCoachBilling, grantCoachCredits, addCoach, assignCoachClient, unassignCoachClient, resolveCoachRequest } from "../actions";
import SearchSelect from "@/components/admin/SearchSelect";

export const dynamic = "force-dynamic";
const WD_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const eur = (c) => (c / 100).toFixed(2).replace(".", ",");
const MODE = { free: "Gratis", credit: "Sessietegoed", invoice: "Maandfactuur" };
const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Coaches() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ data: people }, { data: avail }, { data: ledger }, { data: links }, { data: sessions }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, coach_billing_mode, coach_session_price_cents").eq("gym_id", gym.id).order("full_name"),
    supabase.from("coach_availability").select("*").eq("gym_id", gym.id).order("weekday"),
    supabase.from("coach_ledger").select("coach_id, delta").eq("gym_id", gym.id),
    supabase.from("coach_clients").select("id, coach_id, client_id").eq("gym_id", gym.id),
    supabase.from("bookings").select("id, coach_id, user_id, starts_at, status, coach_billing, coach_charge_cents, services(name)").eq("gym_id", gym.id).not("coach_id", "is", null).order("starts_at", { ascending: false }).limit(400),
  ]);
  const { data: reqs } = await supabase.from("coach_session_requests").select("*").eq("gym_id", gym.id).eq("status", "pending").order("created_at");
  const reqByCoach = {};
  for (const r of reqs || []) (reqByCoach[r.coach_id] ||= []).push(r);

  const all = people || [];
  const coaches = all.filter((p) => p.role === "coach" || p.role === "beheerder");
  const members = all.filter((p) => p.role !== "beheerder"); // assignable as clients
  const name = (id) => all.find((p) => p.id === id)?.full_name || all.find((p) => p.id === id)?.email || "—";

  const byCoachAvail = {};
  for (const a of avail || []) (byCoachAvail[a.coach_id] ||= []).push(a);
  const balance = {};
  for (const r of ledger || []) balance[r.coach_id] = (balance[r.coach_id] || 0) + r.delta;
  const invoice = {};
  for (const s of sessions || []) if (s.coach_billing === "invoice" && s.status === "bevestigd" && new Date(s.starts_at) >= monthStart) invoice[s.coach_id] = (invoice[s.coach_id] || 0) + (s.coach_charge_cents || 0);

  const clientsOf = {};
  for (const l of links || []) (clientsOf[l.coach_id] ||= []).push(l);
  const sessOf = {};
  for (const s of sessions || []) (sessOf[s.coach_id] ||= []).push(s);

  const hours = [];
  for (let h = gym.open_hour; h <= gym.close_hour; h++) hours.push(h);

  const totalLinks = (links || []).length;
  const sessThisMonth = (sessions || []).filter((s) => s.status === "bevestigd" && new Date(s.starts_at) >= monthStart && new Date(s.starts_at) < now).length;
  const nonCoaches = all.filter((p) => p.role === "lid");

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Coaches</h1>
          <p className="mt-1 text-sm text-brand/50">Toewijzingen, sessies, facturatie en beschikbaarheid per coach.</p>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-paper px-3 py-1.5 text-brand/60">{coaches.length} coaches</span>
          <span className="rounded-full bg-paper px-3 py-1.5 text-brand/60">{totalLinks} toewijzingen</span>
          <span className="rounded-full bg-paper px-3 py-1.5 text-brand/60">{sessThisMonth} sessies deze maand</span>
        </div>
      </div>

      {/* Add coach */}
      <form action={addCoach} className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-borderc bg-white p-4">
        <Lbl t="Maak een lid coach">
          <SearchSelect name="memberId" required placeholder="Kies een lid…" options={nonCoaches.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
        </Lbl>
        <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">+ Coach toevoegen</button>
      </form>

      <div className="mt-6 space-y-5">
        {coaches.map((c) => {
          const cls = clientsOf[c.id] || [];
          const assignedIds = new Set(cls.map((l) => l.client_id));
          const ss = sessOf[c.id] || [];
          const upcoming = ss.filter((s) => new Date(s.starts_at) >= now && s.status === "bevestigd").length;
          return (
            <div key={c.id} className="rounded-2xl border border-borderc bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-black text-brand">{c.full_name || c.email}</p>
                  <p className="text-xs text-brand/45">{c.email}{c.role === "beheerder" && " · beheerder"}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-brand/5 px-3 py-1 text-brand/70">{MODE[c.coach_billing_mode] || "—"}</span>
                  <span className="rounded-full bg-paper px-3 py-1 text-brand/60">{cls.length} clients</span>
                  <span className="rounded-full bg-paper px-3 py-1 text-brand/60">{upcoming} gepland</span>
                  {c.coach_billing_mode === "credit" && <span className="rounded-full bg-paper px-3 py-1 text-brand/60">Saldo: {balance[c.id] || 0}</span>}
                  {c.coach_billing_mode === "invoice" && <span className="rounded-full bg-accent/15 px-3 py-1 text-accentdark">Te factureren: {euro(invoice[c.id] || 0)}</span>}
                </div>
              </div>

              {/* Pending session requests */}
              {(reqByCoach[c.id] || []).length > 0 && (
                <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-accentdark">Sessie-aanvragen</p>
                  {reqByCoach[c.id].map((r) => (
                    <div key={r.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-brand">{r.qty} sessies{r.note ? ` — ${r.note}` : ""}</span>
                      <div className="flex gap-2">
                        <form action={resolveCoachRequest}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="approved" /><button className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-brand">Goedkeuren (+{r.qty})</button></form>
                        <form action={resolveCoachRequest}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="declined" /><button className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">Afwijzen</button></form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Invoice line items (this month) */}
              {c.coach_billing_mode === "invoice" && invoice[c.id] > 0 && (
                <details className="mt-3 rounded-xl bg-paper/60 p-3 text-sm">
                  <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-lav">Te factureren deze maand: {euro(invoice[c.id])} — bekijk lijnen</summary>
                  <div className="mt-2 space-y-1">
                    {(sessOf[c.id] || []).filter((s) => s.coach_billing === "invoice" && s.status === "bevestigd" && new Date(s.starts_at) >= monthStart).map((s) => (
                      <div key={s.id} className="flex justify-between text-xs">
                        <span className="text-brand/70">{fmt(s.starts_at)} · {name(s.user_id)} · {s.services?.name}</span>
                        <span className="font-bold text-brand">{euro(s.coach_charge_cents)}</span>
                      </div>
                    ))}
                  </div>
                  <Link href={`/beheer/factuur?coach=${c.id}&month=${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`} className="mt-3 inline-block rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90">Maak factuur (6% btw) →</Link>
                </details>
              )}

              {/* Clients */}
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-lav">Toegewezen clients</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cls.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">
                        <Link href={`/beheer/leden/${l.client_id}`} className="hover:text-accentdark">{name(l.client_id)}</Link>
                        <form action={unassignCoachClient} className="inline">
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="clientId" value={l.client_id} />
                          <button className="text-red-500 hover:underline" title="Verwijder">×</button>
                        </form>
                      </span>
                    ))}
                    {cls.length === 0 && <span className="text-xs text-brand/40">Nog geen clients toegewezen.</span>}
                  </div>
                  <form action={assignCoachClient} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="coachId" value={c.id} />
                    <SearchSelect name="clientId" required placeholder="Wijs een lid toe…" options={members.filter((m) => m.id !== c.id && !assignedIds.has(m.id)).map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
                    <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Toewijzen</button>
                  </form>
                </div>

                {/* Sessions with clients */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-lav">Sessies met clients</p>
                  <div className="mt-2 space-y-1.5">
                    {ss.slice(0, 6).map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                        <span className="font-semibold text-brand">{name(s.user_id)}</span>
                        <span className="text-xs text-brand/50">{fmt(s.starts_at)} · {s.services?.name || "Sessie"}</span>
                      </div>
                    ))}
                    {ss.length === 0 && <p className="text-xs text-brand/40">Nog geen sessies.</p>}
                    {ss.length > 6 && <p className="text-xs text-brand/40">+ {ss.length - 6} eerdere sessies</p>}
                  </div>
                </div>
              </div>

              {/* Config: billing + availability (tucked away) */}
              <details className="mt-5 rounded-xl bg-paper/60 p-4">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-lav">Facturatie & beschikbaarheid</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <form action={setCoachBilling} className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-4">
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
                  <form action={grantCoachCredits} className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-4">
                    <input type="hidden" name="coachId" value={c.id} />
                    <Lbl t="Sessietegoed ±"><input name="delta" type="number" placeholder="bv. 10" className="w-24 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
                    <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Toekennen</button>
                  </form>
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-lav">Beschikbaarheid</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(byCoachAvail[c.id] || []).map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                      {WD_FULL[a.weekday].slice(0, 2)} {a.from_hour}:00–{a.to_hour}:00
                      <form action={deleteCoachAvailability} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-red-500 hover:underline">×</button>
                      </form>
                    </span>
                  ))}
                  {(byCoachAvail[c.id] || []).length === 0 && <span className="text-xs text-brand/40">Geen beschikbaarheid.</span>}
                </div>
                <form action={addCoachAvailability} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="coachId" value={c.id} />
                  <Lbl t="Dag"><select name="weekday" className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{WD_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Lbl>
                  <Lbl t="Van"><select name="from_hour" defaultValue={9} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
                  <Lbl t="Tot"><select name="to_hour" defaultValue={18} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
                  <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Beschikbaarheid</button>
                </form>
              </details>
            </div>
          );
        })}
        {coaches.length === 0 && (
          <p className="rounded-xl bg-accent/10 p-4 text-sm font-semibold text-accentdark">Nog geen coaches. Maak hierboven een lid coach.</p>
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
