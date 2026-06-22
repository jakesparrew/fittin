import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { setClientPrice } from "../actions";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const eur = (c) => ((c || 0) / 100).toFixed(2).replace(".", ",");

export const dynamic = "force-dynamic";
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (d) => (d ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(d)) : "nooit");

export default async function CoachClienten() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;

  const { data: links } = await supabase
    .from("coach_clients")
    .select("id, price_cents, client:profiles!coach_clients_client_id_fkey(id, full_name, email)")
    .eq("coach_id", userId);
  const clients = (links || []).map((l) => l.client).filter(Boolean);
  const priceByClient = {};
  for (const l of links || []) if (l.client) priceByClient[l.client.id] = l.price_cents;
  const ids = clients.map((c) => c.id);

  let programs = [], bookings = [], logs = [], creditRows = [];
  if (ids.length) {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [pRes, bRes, lRes, cRes] = await Promise.all([
      supabase.from("programs").select("id, name, member_id").eq("coach_id", userId).in("member_id", ids),
      supabase.from("bookings").select("id, user_id, starts_at, status, services(name)").eq("coach_id", userId).in("user_id", ids).order("starts_at"),
      supabase.from("workout_logs").select("user_id, created_at").in("user_id", ids).gte("created_at", weekAgo.toISOString()),
      supabase.from("coach_credit_ledger").select("client_id, delta").eq("coach_id", userId).in("client_id", ids),
    ]);
    programs = pRes.data || []; bookings = bRes.data || []; logs = lRes.data || []; creditRows = cRes.data || [];
  }
  const creditByClient = {};
  for (const r of creditRows) creditByClient[r.client_id] = (creditByClient[r.client_id] || 0) + r.delta;

  const now = Date.now();
  const progByClient = {};
  for (const p of programs) progByClient[p.member_id] = p;
  const lastActive = {}; const weekCount = {};
  for (const l of logs) {
    weekCount[l.user_id] = (weekCount[l.user_id] || 0) + 1;
    if (!lastActive[l.user_id] || new Date(l.created_at) > new Date(lastActive[l.user_id])) lastActive[l.user_id] = l.created_at;
  }
  const nextByClient = {};
  for (const b of bookings) {
    if (b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now && !nextByClient[b.user_id]) nextByClient[b.user_id] = b;
  }

  return (
    <div className="px-8 py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Mijn clienten</h1>
      <p className="mt-1 text-sm text-brand/50">Volg de vooruitgang van elke client en beheer hun programma.</p>

      {clients.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
          <p className="font-semibold text-brand/70">Je hebt nog geen toegewezen clienten.</p>
          <p className="mt-1 text-sm text-brand/50">De beheerder koppelt leden aan jou als coach.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {clients.map((c) => {
            const prog = progByClient[c.id];
            const next = nextByClient[c.id];
            return (
              <div key={c.id} className="rounded-2xl border border-borderc bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-brand">{c.full_name || c.email}</p>
                    <p className="text-xs text-brand/45">{c.email}</p>
                  </div>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + ((weekCount[c.id] || 0) > 0 ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/50")}>
                    {weekCount[c.id] || 0} sessies (7d)
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                  <Mini label="Laatst actief" value={fmtDay(lastActive[c.id])} />
                  <Mini label="Programma" value={prog ? "✓" : "—"} />
                  <Mini label="Volgende" value={next ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(next.starts_at)) : "—"} />
                  <Mini label="Sessietegoed" value={creditByClient[c.id] || 0} />
                </div>

                {next && <p className="mt-3 text-xs capitalize text-brand/50">Volgende sessie: {fmt(next.starts_at)} · {next.services?.name}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {prog ? (
                    <Link href={`/coach/programmas/${prog.id}`} className="rounded-full bg-paper px-4 py-2 text-xs font-bold text-brand transition hover:bg-accent/15">{prog.name} →</Link>
                  ) : (
                    <Link href="/coach/programmas" className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-brand transition hover:opacity-90">+ Programma toewijzen</Link>
                  )}
                  <Link href={`/coach#boeken`} className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-lav">Sessie boeken</Link>
                </div>

                {/* Afgesproken tarief — enkel een notitie. Clienten betalen jou rechtstreeks (bv. Bancontact), niet via het platform. */}
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borderc pt-4">
                  <form action={setClientPrice} className="flex items-end gap-2">
                    <input type="hidden" name="clientId" value={c.id} />
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Afgesproken tarief/sessie (€)</span>
                      <input name="price_eur" defaultValue={eur(priceByClient[c.id])} className="w-44 rounded-lg border-2 border-borderc px-3 py-1.5 text-sm" />
                    </label>
                    <button className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">Opslaan</button>
                  </form>
                  <p className="pb-2 text-xs text-brand/40">Notitie voor jezelf — je client betaalt je rechtstreeks (bv. Bancontact), niet via het platform.</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-lav">{label}</p>
      <p className="mt-1 text-sm font-black text-brand">{value}</p>
    </div>
  );
}
