import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoachContext } from "@/lib/coach";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCoachPaymentRequest, cancelCoachPaymentRequest, coachSaveClientNote } from "@/app/coach/actions";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(new Date(iso));

export default async function CoachClientDetail({ params }) {
  const { id } = await params;
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  // Authorization: this must be an accepted client of the coach.
  const { data: link } = await supabase.from("coach_clients").select("id, price_cents").eq("coach_id", userId).eq("client_id", id).eq("status", "accepted").maybeSingle();
  if (!link) notFound();

  const now = Date.now();
  const since30 = new Date(now - 30 * 86400000).toISOString();
  // Cross-user reads (client's profile / logs / weight) need the service role — authorized above by
  // the accepted coach_clients link. The coach's own rows (bookings/requests/note) use their client.
  const admin = createAdminClient();
  const [{ data: client }, { data: bookings }, { data: logs }, { data: weights }, { data: reqs }, { data: note }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").eq("id", id).single(),
    supabase.from("bookings").select("id, starts_at, ends_at, status, persons, services(name)").eq("coach_id", userId).eq("user_id", id).order("starts_at", { ascending: false }).limit(50),
    admin.from("workout_logs").select("logged_on").eq("user_id", id).gte("logged_on", since30.slice(0, 10)),
    admin.from("body_metrics").select("logged_on, weight_kg").eq("user_id", id).order("logged_on", { ascending: false }).limit(1),
    supabase.from("coach_payment_requests").select("id, amount_cents, description, status, created_at, paid_at").eq("coach_id", userId).eq("client_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("coach_client_notes").select("body").eq("coach_id", userId).eq("client_id", id).maybeSingle(),
  ]);
  if (!client) notFound();

  const confirmed = (bookings || []).filter((b) => b.status === "bevestigd");
  const upcoming = confirmed.filter((b) => new Date(b.starts_at).getTime() >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = confirmed.filter((b) => new Date(b.starts_at).getTime() < now);
  const sessions30 = past.filter((b) => new Date(b.starts_at).getTime() >= now - 30 * 86400000).length;
  const logDays = new Set((logs || []).map((l) => l.logged_on)).size;
  const lastWeight = (weights || [])[0];

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach/clienten" className="text-sm font-semibold text-brand/50 hover:text-brand">← Mijn clienten</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">{client.full_name || client.email}</h1>
          <p className="mt-1 text-sm text-brand/50">{client.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/coach#boeken" className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90">Sessie boeken</Link>
          <Link href={`/coach/berichten?client=${client.id}`} className="rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent">Bericht sturen</Link>
        </div>
      </div>

      {/* Snapshot */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Mini label="Sessies met jou" value={past.length} />
        <Mini label="Laatste 30 dagen" value={sessions30} />
        <Mini label="Workouts gelogd (30d)" value={logDays} hint="dagen actief in de app" />
        <Mini label="Laatste gewicht" value={lastWeight ? `${Number(lastWeight.weight_kg).toFixed(1)} kg` : "—"} hint={lastWeight ? fmtDay(lastWeight.logged_on) : "nog niet gelogd"} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Sessions */}
        <section className="rounded-3xl border border-borderc bg-white p-6">
          <h2 className="font-black text-brand">Sessies</h2>
          {upcoming.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-lav">Aankomend</p>
              <div className="mt-2 space-y-1.5">
                {upcoming.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl bg-accent/5 px-4 py-2.5 text-sm">
                    <span className="font-semibold capitalize text-brand">{fmt(b.starts_at)}</span>
                    <span className="text-brand/50">{b.services?.name} · {b.persons}p</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-lav">Verleden</p>
            {past.length === 0 ? (
              <p className="mt-2 text-sm text-brand/50">Nog geen afgeronde sessies.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {past.slice(0, 12).map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl bg-paper px-4 py-2.5 text-sm">
                    <span className="capitalize text-brand/70">{fmt(b.starts_at)}</span>
                    <span className="text-brand/40">{b.services?.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          {/* Private note */}
          <section className="rounded-3xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Privé-notitie</h2>
            <p className="mt-1 text-xs text-brand/50">Alleen jij ziet dit. Bv. doelen, blessures, voorkeuren.</p>
            <ActionForm action={coachSaveClientNote} success="Notitie opgeslagen ✓" className="mt-3">
              <input type="hidden" name="clientId" value={client.id} />
              <textarea name="body" rows={5} defaultValue={note?.body || ""} placeholder="Notities over deze client…" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
              <button className="mt-2 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90">Opslaan</button>
            </ActionForm>
          </section>

          {/* Payment requests (Batch 3.6) */}
          <section className="rounded-3xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Betaalverzoek</h2>
            <p className="mt-1 text-xs text-brand/50">Stuur een verzoek — je client betaalt via de app (Stripe). {link.price_cents ? `Afgesproken tarief: ${euro(link.price_cents)}.` : ""}</p>
            <ActionForm action={sendCoachPaymentRequest} success="Betaalverzoek verstuurd ✓" className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="clientId" value={client.id} />
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Bedrag (€)</span>
                <input name="amount_eur" required defaultValue={link.price_cents ? (link.price_cents / 100).toFixed(2).replace(".", ",") : ""} placeholder="60" className="w-24 rounded-lg border-2 border-borderc px-3 py-1.5 text-sm" />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Omschrijving</span>
                <input name="description" placeholder="bv. Personal training juli" className="w-full rounded-lg border-2 border-borderc px-3 py-1.5 text-sm" />
              </label>
              <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand transition hover:opacity-90">Verstuur</button>
            </ActionForm>
            {(reqs || []).length > 0 && (
              <div className="mt-4 space-y-2 border-t border-borderc pt-3">
                {reqs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-brand/70">{euro(r.amount_cents)} · {r.description || "PT"} <span className="text-xs text-brand/40">{fmtDay(r.created_at)}</span></span>
                    <span className="flex items-center gap-2">
                      <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + (r.status === "paid" ? "bg-accent/15 text-accentdark" : r.status === "cancelled" ? "bg-paper text-brand/40" : "bg-amber-100 text-amber-700")}>{r.status === "paid" ? "betaald" : r.status === "cancelled" ? "geannuleerd" : "open"}</span>
                      {r.status === "pending" && (
                        <ActionForm action={cancelCoachPaymentRequest}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-xs font-bold text-brand/40 hover:text-red-500">annuleer</button>
                        </ActionForm>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-brand">{value}</p>
      {hint && <p className="mt-1 text-xs text-brand/45">{hint}</p>}
    </div>
  );
}
