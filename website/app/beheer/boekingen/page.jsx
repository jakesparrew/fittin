import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { slotInstant, brusselsDateStr } from "@/lib/time";
import { adminCancelBooking, adminBlockSlot, adminUnblock, adminCreateBooking } from "../actions";
import SearchSelect from "@/components/admin/SearchSelect";

export const dynamic = "force-dynamic";

export default async function Boekingen({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const sp = (await searchParams) || {};
  const weekOffset = parseInt(sp.w || "0", 10) || 0;

  // 7 days from today + offset weeks
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + weekOffset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    days.push({
      dateStr: brusselsDateStr(d),
      weekday: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short" }).format(d),
      dayMonth: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d),
    });
  }
  const from = slotInstant(days[0].dateStr, 0).toISOString();
  const to = new Date(slotInstant(days[6].dateStr, 23).getTime() + 3600000).toISOString();

  const [{ data: bookings }, { data: blocks }, { data: members }, { data: services }] = await Promise.all([
    supabase.from("bookings").select("id, starts_at, status, persons, member:profiles!bookings_user_id_fkey(full_name), services(name)").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", from).lt("starts_at", to),
    supabase.from("slot_blocks").select("id, starts_at, reason").eq("gym_id", gym.id).gte("starts_at", from).lt("starts_at", to),
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).order("full_name"),
    supabase.from("services").select("id, name").eq("gym_id", gym.id).eq("active", true).order("price_cents"),
  ]);

  const bookMap = new Map();
  for (const b of bookings || []) bookMap.set(new Date(b.starts_at).getTime(), b);
  const blockMap = new Map();
  for (const b of blocks || []) blockMap.set(new Date(b.starts_at).getTime(), b);

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);

  return (
    <div className="px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-brand">Boekingen</h1>
        <div className="flex items-center gap-2 text-sm font-bold">
          <Link href={`/beheer/boekingen?w=${weekOffset - 1}`} className="rounded-full border-2 border-borderc px-4 py-1.5 hover:border-lav">←</Link>
          <span className="text-brand/60">{days[0].dayMonth} – {days[6].dayMonth}</span>
          <Link href={`/beheer/boekingen?w=${weekOffset + 1}`} className="rounded-full border-2 border-borderc px-4 py-1.5 hover:border-lav">→</Link>
        </div>
      </header>

      {/* Create booking on behalf + block slot */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <form action={adminCreateBooking} className="flex flex-wrap items-end gap-2 rounded-2xl border border-borderc bg-white p-4">
          <Lbl t="Boeking voor lid">
            <SearchSelect name="memberId" required placeholder="Kies lid…" options={(members || []).map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
          </Lbl>
          <Lbl t="Dienst">
            <select name="serviceId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              {(services || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Lbl>
          <Lbl t="Datum"><input name="date" type="date" required defaultValue={days[0].dateStr} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <Lbl t="Uur"><HourSelect name="hour" hours={hours} /></Lbl>
          <Lbl t="Pers"><input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">+ Boeken</button>
        </form>

        <form action={adminBlockSlot} className="flex flex-wrap items-end gap-2 rounded-2xl border border-borderc bg-white p-4">
          <Lbl t="Blokkeer datum"><input name="date" type="date" required defaultValue={days[0].dateStr} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <Lbl t="Uur"><HourSelect name="hour" hours={hours} /></Lbl>
          <Lbl t="Reden"><input name="reason" placeholder="onderhoud…" className="w-32 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <button className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white">Blokkeer</button>
        </form>
      </div>

      {/* Week grid */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-borderc text-brand/50">
              <th className="w-12 px-2 py-2"></th>
              {days.map((d) => (
                <th key={d.dateStr} className="px-2 py-2 font-bold">
                  <div className="uppercase">{d.weekday}</div>
                  <div className="text-brand">{d.dayMonth}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h} className="border-b border-borderc/60">
                <td className="px-2 py-1 text-right font-bold text-brand/40">{h}:00</td>
                {days.map((d) => {
                  const t = slotInstant(d.dateStr, h).getTime();
                  const bk = bookMap.get(t);
                  const bl = blockMap.get(t);
                  return (
                    <td key={d.dateStr} className="border-l border-borderc/60 p-1 align-top">
                      {bk ? (
                        <div className="rounded-lg bg-accent/20 p-1.5">
                          <p className="font-bold text-brand">{bk.member?.full_name || "Lid"}</p>
                          <p className="text-brand/50">{bk.services?.name} · {bk.persons}p</p>
                          <form action={adminCancelBooking}>
                            <input type="hidden" name="bookingId" value={bk.id} />
                            <button className="mt-0.5 text-[10px] font-bold text-red-500 hover:underline">annuleer</button>
                          </form>
                        </div>
                      ) : bl ? (
                        <div className="rounded-lg bg-brand/10 p-1.5">
                          <p className="font-bold text-brand/60">Geblokkeerd</p>
                          {bl.reason && <p className="text-brand/40">{bl.reason}</p>}
                          <form action={adminUnblock}>
                            <input type="hidden" name="blockId" value={bl.id} />
                            <button className="mt-0.5 text-[10px] font-bold text-accentdark hover:underline">deblokkeer</button>
                          </form>
                        </div>
                      ) : (
                        <div className="h-7" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
function HourSelect({ name, hours }) {
  return (
    <select name={name} required className="w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
      {hours.map((h) => <option key={h} value={h}>{h}:00</option>)}
    </select>
  );
}
