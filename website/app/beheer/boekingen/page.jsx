import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { slotInstant, brusselsDateStr, fmtHour } from "@/lib/time";
import { adminCreateBooking, adminAssignCoach } from "../actions";
import SearchSelect from "@/components/admin/SearchSelect";
import AdminWeekGrid from "@/components/admin/AdminWeekGrid";
import BookingsList from "@/components/admin/BookingsList";
import SubmitButton from "@/components/ui/SubmitButton";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

export default async function Boekingen({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const sp = (await searchParams) || {};
  const weekOffset = parseInt(sp.w || "0", 10) || 0;

  // Calendar week starting on MONDAY (+ offset weeks).
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dow = (base.getDay() + 6) % 7; // days since Monday (0=Mon … 6=Sun)
  base.setDate(base.getDate() - dow + weekOffset * 7);
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

  const listFrom = new Date(Date.now() - 30 * 86400000).toISOString(); // overview: last 30 days + all upcoming
  const [{ data: bookings }, { data: blocks }, { data: members }, { data: services }, { data: allBookings }, { data: taken }, { data: coaches }] = await Promise.all([
    supabase.from("bookings").select("id, user_id, coach_id, starts_at, status, persons, member:profiles!bookings_user_id_fkey(full_name), services(name)").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", from).lt("starts_at", to),
    supabase.from("slot_blocks").select("id, starts_at, reason").eq("gym_id", gym.id).gte("starts_at", from).lt("starts_at", to),
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).order("full_name"),
    supabase.from("services").select("id, name").eq("gym_id", gym.id).eq("active", true).order("price_cents"),
    supabase.from("bookings").select("id, created_at, starts_at, ends_at, status, persons, paid, price_cents, payment_source, coach_id, member:profiles!bookings_user_id_fkey(full_name, email), coach:profiles!bookings_coach_id_fkey(full_name), services(name)").eq("gym_id", gym.id).gte("starts_at", listFrom).order("starts_at", { ascending: true }).limit(1000),
    // Every 30-min cell that a booking covers (1h sessions span 2 cells) — so continuation cells show as "bezet", not free.
    supabase.rpc("gym_taken_slots", { p_gym: gym.id, p_from: from, p_to: to }),
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).eq("role", "coach").order("full_name"),
  ]);

  const bookingRows = (allBookings || []).map((b) => ({
    id: b.id, created_at: b.created_at, starts_at: b.starts_at, ends_at: b.ends_at, status: b.status, persons: b.persons,
    paid: b.paid, price_cents: b.price_cents, payment_source: b.payment_source,
    member_name: b.member?.full_name || b.member?.email, coach_id: b.coach_id, coach_name: b.coach?.full_name, service_name: b.services?.name,
  }));

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h += 0.5) hours.push(h);

  const memberOpts = (members || []).map((m) => ({ id: m.id, label: m.full_name || m.email }));
  const serviceOpts = services || [];
  const coachOpts = (coaches || []).map((c) => ({ id: c.id, label: c.full_name || c.email }));

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

      {/* Create booking on behalf */}
      <div className="mt-6">
        <ActionForm action={adminCreateBooking} success="Boeking aangemaakt ✓" className="flex flex-wrap items-end gap-2 rounded-2xl border border-borderc bg-white p-4">
          <Lbl t="Boeking voor lid">
            <SearchSelect name="memberId" required placeholder="Kies lid…" options={(members || []).map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
          </Lbl>
          <Lbl t="Coach (optioneel)">
            <SearchSelect name="coachId" placeholder="Geen coach" options={coachOpts.map((c) => ({ value: c.id, label: c.label }))} />
          </Lbl>
          <Lbl t="Sessie">
            <select name="serviceId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
              {(services || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Lbl>
          <Lbl t="Datum"><input name="date" type="date" required defaultValue={days[0].dateStr} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <Lbl t="Uur"><HourSelect name="hour" hours={hours} /></Lbl>
          <Lbl t="Pers"><input name="persons" type="number" min="1" max="4" defaultValue="1" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
          <label className="flex items-center gap-2 pb-1 text-xs font-bold text-brand/70">
            <input type="checkbox" name="useCredit" className="h-4 w-4 accent-[#5fda6b]" />
            Trek 1 sessie af
          </label>
          <SubmitButton className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">+ Boeken</SubmitButton>
        </ActionForm>
      </div>

      {/* Week grid — click to plan/block, drag over empty hours to block a range */}
      <AdminWeekGrid
        days={days}
        hours={hours}
        bookings={(bookings || []).map((b) => ({ t: new Date(b.starts_at).getTime(), id: b.id, name: b.member?.full_name, serviceName: b.services?.name, persons: b.persons, reserved: !!b.coach_id && b.user_id === b.coach_id }))}
        takenSlots={(taken || []).map((t) => t.starts_at)}
        blocks={(blocks || []).map((b) => ({ t: new Date(b.starts_at).getTime(), id: b.id, reason: b.reason }))}
        members={memberOpts}
        services={serviceOpts}
        coaches={coachOpts}
      />

      <BookingsList bookings={bookingRows} coaches={coachOpts} />
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
      {hours.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
    </select>
  );
}
