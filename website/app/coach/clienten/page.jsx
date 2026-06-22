import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { setClientPrice, coachRequestClient, respondCoachLink, removeCoachLink } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import SearchSelect from "@/components/admin/SearchSelect";
import AddClientInline from "@/components/coach/AddClientInline";

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
    .select("id, status, requested_by, price_cents, client:profiles!coach_clients_client_id_fkey(id, full_name, email)")
    .eq("coach_id", userId);
  const all = (links || []).filter((l) => l.client);
  const accepted = all.filter((l) => l.status === "accepted");
  const incoming = all.filter((l) => l.status === "pending" && l.requested_by === "client"); // client asked me
  const sent = all.filter((l) => l.status === "pending" && l.requested_by === "coach");       // I invited them

  const clients = accepted.map((l) => l.client);
  const ids = clients.map((c) => c.id);

  // Members in this gym available to connect (not already linked in any state).
  const linkedIds = new Set(all.map((l) => l.client.id));
  const { data: gymMembers } = await supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).eq("role", "lid").order("full_name");
  const connectable = (gymMembers || []).filter((m) => !linkedIds.has(m.id));

  let bookings = [], logs = [], creditRows = [];
  if (ids.length) {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [bRes, lRes, cRes] = await Promise.all([
      supabase.from("bookings").select("id, user_id, starts_at, status, services(name)").eq("coach_id", userId).in("user_id", ids).order("starts_at"),
      supabase.from("workout_logs").select("user_id, created_at").in("user_id", ids).gte("created_at", weekAgo.toISOString()),
      supabase.from("coach_credit_ledger").select("client_id, delta").eq("coach_id", userId).in("client_id", ids),
    ]);
    bookings = bRes.data || []; logs = lRes.data || []; creditRows = cRes.data || [];
  }
  const creditByClient = {};
  for (const r of creditRows) creditByClient[r.client_id] = (creditByClient[r.client_id] || 0) + r.delta;

  const now = Date.now();
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
      <p className="mt-1 text-sm text-brand/50">Verbind je met leden en volg hun vooruitgang. Enkel verbonden clienten kan je boeken.</p>

      {/* Connect a client */}
      <div className="mt-6 rounded-3xl border-2 border-accent bg-white p-6 shadow-sm shadow-accent/10">
        <h2 className="text-lg font-black text-brand">Verbind een client</h2>
        <p className="mt-1 text-sm text-brand/60">Stuur een verbindingsverzoek naar een lid. Zij krijgen een melding om te aanvaarden — pas daarna verschijnt de client hieronder en kan je sessies met hen boeken. Een lid kan jou ook zelf aanvragen.</p>
        {connectable.length > 0 ? (
          <ActionForm action={coachRequestClient} success="Verbindingsverzoek verstuurd ✓" className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem]">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Kies een lid</span>
              <SearchSelect name="clientId" required placeholder="Zoek een lid…" options={connectable.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
            </div>
            <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand transition hover:opacity-90">Verbindingsverzoek sturen</button>
          </ActionForm>
        ) : (
          <p className="mt-3 text-sm text-brand/50">Alle leden zijn al verbonden of uitgenodigd.</p>
        )}
        <AddClientInline />
        <p className="mt-2 text-xs text-brand/40">Nieuw lid zonder account? Maak het hierboven aan via e-mail — het wordt meteen aan jou verbonden en krijgt een login-uitnodiging.</p>
      </div>

      {/* Incoming connection requests (a member asked to be coached by me) */}
      {incoming.length > 0 && (
        <div className="mt-6 rounded-3xl border border-borderc bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-brand">Verzoeken om verbinding <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accentdark">{incoming.length}</span></h2>
          <p className="mt-1 text-sm text-brand/50">Deze leden willen door jou gecoacht worden.</p>
          <div className="mt-3 space-y-2">
            {incoming.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc p-4">
                <div><p className="font-bold text-brand">{l.client.full_name || l.client.email}</p><p className="text-xs text-brand/45">{l.client.email}</p></div>
                <div className="flex gap-2">
                  <ActionForm action={respondCoachLink} success="Bijgewerkt ✓"><input type="hidden" name="linkId" value={l.id} /><input type="hidden" name="accept" value="1" /><button className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-brand transition hover:opacity-90">Aanvaarden</button></ActionForm>
                  <ActionForm action={respondCoachLink} success="Bijgewerkt ✓"><input type="hidden" name="linkId" value={l.id} /><input type="hidden" name="accept" value="0" /><button className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Weigeren</button></ActionForm>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invitations I sent, awaiting acceptance */}
      {sent.length > 0 && (
        <div className="mt-6 rounded-3xl border border-borderc bg-white p-6">
          <h2 className="text-lg font-black text-brand">Verzonden uitnodigingen</h2>
          <p className="mt-1 text-sm text-brand/50">Wachten tot het lid je verbinding aanvaardt.</p>
          <div className="mt-3 space-y-2">
            {sent.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc p-4">
                <div><p className="font-bold text-brand">{l.client.full_name || l.client.email}</p><p className="text-xs text-brand/45">{l.client.email}</p></div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/50">In afwachting</span>
                  <ActionForm action={removeCoachLink} success="Verwijderd ✓"><input type="hidden" name="linkId" value={l.id} /><button className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Annuleer</button></ActionForm>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected clients */}
      <h2 className="mt-8 text-xl font-black text-brand">Verbonden clienten</h2>
      {accepted.length === 0 ? (
        <div className="mt-3 rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
          <p className="font-semibold text-brand/70">Nog geen verbonden clienten.</p>
          <p className="mt-1 text-sm text-brand/50">Verbind hierboven een lid, of laat een lid jou aanvragen via je coachprofiel.</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {accepted.map((l) => {
            const c = l.client;
            const next = nextByClient[c.id];
            return (
              <div key={l.id} className="rounded-2xl border border-borderc bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-brand">{c.full_name || c.email}</p>
                    <p className="text-xs text-brand/45">{c.email}</p>
                  </div>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + ((weekCount[c.id] || 0) > 0 ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/50")}>
                    {weekCount[c.id] || 0} sessies (7d)
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <Mini label="Laatst actief" value={fmtDay(lastActive[c.id])} />
                  <Mini label="Volgende" value={next ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(next.starts_at)) : "—"} />
                  <Mini label="Sessietegoed" value={creditByClient[c.id] || 0} />
                </div>

                {next && <p className="mt-3 text-xs capitalize text-brand/50">Volgende sessie: {fmt(next.starts_at)} · {next.services?.name}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/coach#boeken" className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-brand transition hover:opacity-90">Sessie boeken</Link>
                  <ActionForm action={removeCoachLink} success="Verwijderd ✓">
                    <input type="hidden" name="linkId" value={l.id} />
                    <button className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Verbreek verbinding</button>
                  </ActionForm>
                </div>

                {/* Afgesproken tarief — enkel een notitie. Clienten betalen jou rechtstreeks (bv. Bancontact), niet via het platform. */}
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borderc pt-4">
                  <ActionForm action={setClientPrice} success="Tarief opgeslagen ✓" className="flex items-end gap-2">
                    <input type="hidden" name="clientId" value={c.id} />
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Afgesproken tarief/sessie (€)</span>
                      <input name="price_eur" defaultValue={eur(l.price_cents)} className="w-44 rounded-lg border-2 border-borderc px-3 py-1.5 text-sm" />
                    </label>
                    <button className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">Opslaan</button>
                  </ActionForm>
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
