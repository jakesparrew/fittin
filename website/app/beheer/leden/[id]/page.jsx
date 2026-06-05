import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { addSessionNote } from "../../coaching-actions";
import { adminAdjustCredits } from "../../actions";

export const dynamic = "force-dynamic";

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function MemberDetail({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const [{ data: member }, { data: bookings }, { data: logs }, { data: notes }, { data: ledger }, { data: program }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).eq("gym_id", gym.id).single(),
      supabase.from("bookings").select("starts_at, status, services(name)").eq("user_id", id).order("starts_at", { ascending: false }).limit(20),
      supabase.from("workout_logs").select("logged_on, sets_json, program_exercise:program_exercises(exercises(name))").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("session_notes").select("body, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("credits_ledger").select("delta").eq("user_id", id),
      supabase.from("programs").select("id, name").eq("member_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  if (!member) return <div className="px-8 py-8">Lid niet gevonden. <Link href="/beheer/leden" className="text-accentdark">Terug</Link></div>;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const confirmed = (bookings || []).filter((b) => b.status === "bevestigd");
  const sessionsThisMonth = confirmed.filter((b) => new Date(b.starts_at) >= monthStart && new Date(b.starts_at) < now).length;
  const lastActivity = logs?.[0]?.logged_on || (confirmed[0] ? confirmed[0].starts_at.slice(0, 10) : null);
  const credits = (ledger || []).reduce((a, r) => a + r.delta, 0);
  const onTrack = sessionsThisMonth >= 4;

  return (
    <div className="px-8 py-8">
      <Link href="/beheer/leden" className="text-sm font-semibold text-brand/50 hover:text-brand">← Leden</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">{member.full_name || "Lid"}</h1>
      <p className="text-sm text-brand/50">{member.email} · {member.role}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Sessies deze maand" value={sessionsThisMonth} />
        <Stat label="Status" value={onTrack ? "On track" : "Haakt af"} accent={onTrack} />
        <Stat label="Credits" value={credits} />
        <Stat label="Laatste activiteit" value={lastActivity || "—"} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-borderc bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-brand">Coach-notitie</h2>
            {program && <Link href={`/beheer/programmas/${program.id}`} className="text-xs font-bold text-accentdark">Programma: {program.name} →</Link>}
          </div>
          <form action={addSessionNote} className="mt-3 flex gap-2">
            <input type="hidden" name="memberId" value={member.id} />
            <input name="body" required placeholder="Korte notitie…" className="flex-1 rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Plaats</button>
          </form>
          <div className="mt-4 space-y-2">
            {(notes || []).map((n, i) => (
              <div key={i} className="rounded-xl bg-paper px-3 py-2 text-sm">
                <p className="text-brand">{n.body}</p>
                <p className="mt-0.5 text-xs text-brand/40">{fmt(n.created_at)}</p>
              </div>
            ))}
            {(!notes || notes.length === 0) && <p className="text-xs text-brand/40">Nog geen notities.</p>}
          </div>

          <h2 className="mt-6 font-black text-brand">Credits aanpassen</h2>
          <form action={adminAdjustCredits} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="memberId" value={member.id} />
            <input name="delta" type="number" placeholder="±" className="w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
            <input name="reason" placeholder="reden" className="w-32 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
            <button className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white">Bijwerken</button>
          </form>
        </section>

        <section className="rounded-2xl border border-borderc bg-white p-6">
          <h2 className="font-black text-brand">Recente boekingen</h2>
          <div className="mt-3 space-y-1.5">
            {confirmed.slice(0, 6).map((b, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="capitalize text-brand">{fmt(b.starts_at)}</span>
                <span className="text-brand/50">{b.services?.name}</span>
              </div>
            ))}
            {confirmed.length === 0 && <p className="text-xs text-brand/40">Nog geen boekingen.</p>}
          </div>

          <h2 className="mt-6 font-black text-brand">Workout-logs</h2>
          <div className="mt-3 space-y-1.5">
            {(logs || []).slice(0, 6).map((l, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="font-bold text-brand">{l.program_exercise?.exercises?.name || "Oefening"}</span>
                <span className="text-brand/50">{l.sets_json?.sets ?? "–"}×{l.sets_json?.reps ?? "–"} · {l.sets_json?.weight_kg ?? "–"}kg</span>
              </div>
            ))}
            {(!logs || logs.length === 0) && <p className="text-xs text-brand/40">Nog geen logs.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
    </div>
  );
}
