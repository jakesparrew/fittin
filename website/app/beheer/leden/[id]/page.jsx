import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { addSessionNote } from "../../coaching-actions";
import { adminAdjustCredits, assignCoachClient, unassignCoachClient, adminSetRole } from "../../actions";
import ActionForm from "@/components/ui/ActionForm";
import { DeleteUserButton } from "@/components/admin/MemberControls";
import SearchSelect from "@/components/admin/SearchSelect";

export const dynamic = "force-dynamic";

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const KIND = { booking: "Boeking", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessies", overig: "Overig" };

export default async function MemberDetail({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile: admin } = ctx;
  const isBeheerder = admin.role === "beheerder";

  const [{ data: member }, { data: bookings }, { data: logs }, { data: notes }, { data: ledger }, { data: program }, { data: coachLinks }, { data: coachList }, { data: coachSessions }, { data: payments }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).eq("gym_id", gym.id).single(),
      supabase.from("bookings").select("starts_at, status, services(name)").eq("user_id", id).order("starts_at", { ascending: false }).limit(20),
      supabase.from("workout_logs").select("logged_on, sets_json, program_exercise:program_exercises(exercises(name))").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("session_notes").select("body, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("credits_ledger").select("delta").eq("user_id", id).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
      supabase.from("programs").select("id, name").eq("member_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("coach_clients").select("id, coach_id, coach:profiles!coach_clients_coach_id_fkey(full_name, email)").eq("gym_id", gym.id).eq("client_id", id).eq("status", "accepted"),
      supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).eq("role", "coach").order("full_name"),
      supabase.from("bookings").select("id, starts_at, status, coach_billing, coach:profiles!bookings_coach_id_fkey(full_name, email), services(name)").eq("user_id", id).not("coach_id", "is", null).order("starts_at", { ascending: false }).limit(20),
      supabase.from("payments").select("amount_cents, kind, description, created_at, status").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
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
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">{member.full_name || "Lid"}</h1>
          <p className="text-sm text-brand/50">{member.email}{member.phone ? " · " + member.phone : ""} · <span className="capitalize font-semibold">{member.role}</span></p>
        </div>
        {isBeheerder && member.id !== admin.id && (
          <div className="flex flex-wrap items-center gap-2">
            {["lid", "coach", "beheerder"].filter((r) => r !== member.role).map((r) => (
              <form key={r} action={adminSetRole}>
                <input type="hidden" name="memberId" value={member.id} />
                <input type="hidden" name="role" value={r} />
                <button className="rounded-full border-2 border-borderc px-3 py-1.5 text-xs font-bold text-brand transition hover:border-accent hover:bg-accent/10">
                  Maak {r === "beheerder" ? "beheerder" : r}
                </button>
              </form>
            ))}
            <DeleteUserButton userId={member.id} name={member.full_name || member.email} />
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Sessies deze maand" value={sessionsThisMonth} />
        <Stat label="Status" value={onTrack ? "On track" : "Haakt af"} accent={onTrack} />
        <Stat label="Sessies" value={credits} />
        <Stat label="Laatste activiteit" value={lastActivity || "—"} />
      </div>

      {/* Coach */}
      <section className="mt-8 rounded-2xl border border-borderc bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-black text-brand">Coach</h2>
          <div className="flex flex-wrap items-center gap-2">
            {(coachLinks || []).map((l) => (
              <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">
                <Link href={`/beheer/coaches`} className="hover:text-accentdark">{l.coach?.full_name || l.coach?.email || "Coach"}</Link>
                <form action={unassignCoachClient} className="inline">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="clientId" value={member.id} />
                  <button className="text-red-500 hover:underline" title="Verwijder">×</button>
                </form>
              </span>
            ))}
            {(!coachLinks || coachLinks.length === 0) && <span className="text-xs text-brand/40">Geen coach toegewezen.</span>}
            <form action={assignCoachClient} className="flex items-center gap-2">
              <input type="hidden" name="clientId" value={member.id} />
              <SearchSelect name="coachId" required placeholder="Wijs coach toe…" options={(coachList || []).filter((co) => co.id !== member.id && !(coachLinks || []).some((l) => l.coach_id === co.id)).map((co) => ({ value: co.id, label: co.full_name || co.email }))} />
              <button className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-brand">Toewijzen</button>
            </form>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-lav">Sessies met coach</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {(coachSessions || []).slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="font-semibold text-brand">{s.coach?.full_name || s.coach?.email || "Coach"}</span>
                <span className="text-xs text-brand/50">{fmt(s.starts_at)} · {s.services?.name || "Sessie"}</span>
              </div>
            ))}
            {(!coachSessions || coachSessions.length === 0) && <p className="text-xs text-brand/40">Nog geen sessies met een coach.</p>}
          </div>
        </div>
      </section>

      {/* Payments */}
      <section className="mt-8 rounded-2xl border border-borderc bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-black text-brand">Betalingen</h2>
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">
            Totaal: {euro((payments || []).reduce((a, p) => a + (p.amount_cents || 0), 0))}
          </span>
        </div>
        <div className="mt-3 space-y-1.5">
          {(payments || []).map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
              <div>
                <span className="font-bold text-brand">{KIND[p.kind] || p.kind}</span>
                {p.description && <span className="ml-2 text-xs text-brand/45">{p.description}</span>}
              </div>
              <div className="text-right">
                <span className="font-black text-brand">{euro(p.amount_cents)}</span>
                <span className="ml-2 text-xs text-brand/40">{fmt(p.created_at)}</span>
              </div>
            </div>
          ))}
          {(!payments || payments.length === 0) && <p className="text-xs text-brand/40">Nog geen betalingen geregistreerd.</p>}
        </div>
      </section>

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

          <h2 className="mt-6 font-black text-brand">Sessies aanpassen</h2>
          <ActionForm action={adminAdjustCredits} success="Sessies aangepast — het lid kreeg een e-mail ✓" className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="memberId" value={member.id} />
            <input name="delta" type="number" placeholder="+3 of -3" title="+ = bijgeven, - = afhalen" className="w-24 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
            <input name="reason" placeholder="reden (lid krijgt mail)" className="w-40 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
            <button className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white">Bijwerken</button>
          </ActionForm>
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
