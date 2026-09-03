import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCoachContext } from "@/lib/coach";
import { setClientPrice, coachRequestClient, respondCoachLink, removeCoachLink, beantwoordDoorgave } from "../actions";
import { feeZin } from "@/lib/aanbreng";
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

  // Klanten die Fittin' aan deze coach doorgaf. Lezen mag met de gewone client (RLS toont enkel de
  // eigen rijen); antwoorden gebeurt via de server action, nooit rechtstreeks van hier.
  const { data: doorgaven } = await supabase
    .from("gym_referrals")
    .select("id, client_id, client_email, client_name, fee_cents, note, status, referred_at")
    .eq("coach_id", userId)
    .in("status", ["voorgesteld", "aanvaard"])
    .order("referred_at", { ascending: false });
  const voorstellen = (doorgaven || []).filter((r) => r.status === "voorgesteld");
  const lopend = (doorgaven || []).filter((r) => r.status === "aanvaard");
  // Zonder client_id valt er nog niets te koppelen: die persoon heeft nog geen account, dus hij
  // kan daardoor ook nog niet als verbonden client in de lijst hieronder staan.
  const doorgaveVan = new Map(lopend.filter((r) => r.client_id).map((r) => [r.client_id, r]));
  const wachtOpAccount = lopend.filter((r) => !r.client_id);

  const now = Date.now();
  const weekAgoMs = now - 7 * 86400000;
  let bookings = [], creditRows = [];
  const lastLogin = {};
  const favByClient = {};
  const losByClient = {};
  if (ids.length) {
    const admin = createAdminClient();
    const [bRes, cRes] = await Promise.all([
      supabase.from("bookings").select("id, user_id, starts_at, status, services(name)").eq("coach_id", userId).in("user_id", ids).order("starts_at"),
      supabase.from("coach_credit_ledger").select("client_id, delta").eq("coach_id", userId).in("client_id", ids),
    ]);
    bookings = bRes.data || []; creditRows = cRes.data || [];

    // Wat doet deze client graag, en wat doet hij ZONDER schema? Twee signalen die een
    // voorschrift concreter maken dan "hij traint 2× per week".
    try {
      const [{ data: favRows }, { data: losRows }] = await Promise.all([
        admin.from("exercise_favorites").select("user_id, exercise:exercises(name)").in("user_id", ids).limit(300),
        // Losse logs landen in het verborgen schema "Losse oefeningen": 3+ keer dezelfde oefening
        // los doen is een warme aanleiding voor een gesprek of een voorschrift.
        admin.from("programs").select("id, member_id, program_days(program_exercises(id, exercise:exercises(name)))")
          .in("member_id", ids).eq("name", "Losse oefeningen"),
      ]);
      for (const f of favRows || []) {
        if (!f.exercise?.name) continue;
        (favByClient[f.user_id] ||= []).push(f.exercise.name);
      }
      const peNaam = new Map();
      const peEigenaar = new Map();
      for (const p of losRows || []) {
        for (const d of p.program_days || []) {
          for (const pe of d.program_exercises || []) {
            if (pe.exercise?.name) { peNaam.set(pe.id, pe.exercise.name); peEigenaar.set(pe.id, p.member_id); }
          }
        }
      }
      if (peNaam.size) {
        const { data: logs } = await admin.from("workout_logs")
          .select("user_id, program_exercise_id").in("program_exercise_id", [...peNaam.keys()])
          .gte("logged_on", new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10));
        const tel = new Map();
        for (const l of logs || []) {
          const sleutel = `${l.user_id}|${peNaam.get(l.program_exercise_id)}`;
          tel.set(sleutel, (tel.get(sleutel) || 0) + 1);
        }
        for (const [sleutel, n] of tel) {
          if (n < 3) continue;
          const [uid, naam] = sleutel.split("|");
          (losByClient[uid] ||= []).push({ naam, n });
        }
      }
    } catch (e) { console.error("coach favorieten/losse logs:", e?.message); }
    // Laatste login per verbonden client (Supabase Auth) → onderdeel van "laatst actief".
    // Eén gepagineerde listUsers i.p.v. een Auth-API-call per client (N+1 + rate-limit-risico).
    try {
      const idSet = new Set(ids);
      for (let page = 1; page <= 10; page++) {
        const { data: au } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const us = au?.users || [];
        for (const u of us) if (idSet.has(u.id) && u.last_sign_in_at) lastLogin[u.id] = u.last_sign_in_at;
        if (us.length < 1000) break;
      }
    } catch (e) { console.error("clienten lastLogin lookup failed:", e?.message); }
  }
  const creditByClient = {};
  for (const r of creditRows) creditByClient[r.client_id] = (creditByClient[r.client_id] || 0) + Number(r.delta || 0);

  // "Sessies (7d)" = bevestigde sessies in de laatste 7 dagen; "laatst actief" = max(login, laatste sessie).
  const lastSession = {}; const weekCount = {}; const nextByClient = {};
  for (const b of bookings) {
    if (b.status !== "bevestigd") continue;
    const t = new Date(b.starts_at).getTime();
    if (t <= now) {
      if (!lastSession[b.user_id] || t > new Date(lastSession[b.user_id]).getTime()) lastSession[b.user_id] = b.starts_at;
      if (t >= weekAgoMs) weekCount[b.user_id] = (weekCount[b.user_id] || 0) + 1;
    } else if (!nextByClient[b.user_id]) {
      nextByClient[b.user_id] = b;
    }
  }
  const lastActive = {};
  for (const id of ids) {
    const cands = [lastLogin[id], lastSession[id]].filter(Boolean).map((d) => new Date(d).getTime());
    if (cands.length) lastActive[id] = new Date(Math.max(...cands)).toISOString();
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Mijn clienten</h1>
      <p className="mt-1 text-sm text-brand/50">Verbind je met leden en volg hun vooruitgang. Enkel verbonden clienten kan je boeken.</p>

      {/* Doorgegeven klanten die nog op een antwoord wachten. Bewust bovenaan: zolang de coach niet
          antwoordt, wacht er iemand op een intake en wordt er niets aangerekend. */}
      {voorstellen.length > 0 && (
        <div className="mt-6 rounded-3xl border-2 border-amber-300 bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-brand">
            Fittin&rsquo; geeft een klant aan je door
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{voorstellen.length}</span>
          </h2>
          <p className="mt-1 text-sm text-brand/60">Deze mensen vroegen een intake aan bij Fittin&rsquo;. Jij beslist of je ze overneemt.</p>
          <div className="mt-3 space-y-3">
            {voorstellen.map((r) => (
              <div key={r.id} className="rounded-2xl border border-borderc p-4">
                <p className="font-bold text-brand">{r.client_name || r.client_email}</p>
                <p className="text-xs text-brand/45">{r.client_email}</p>
                {r.note && <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-xs text-brand/60">{r.note}</p>}
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">De voorwaarde: {feeZin(r.fee_cents)}.</p>
                <ul className="mt-2 space-y-1 text-xs text-brand/60">
                  <li>Die halve beurt komt van jouw tegoed. Wat je client betaalt, verandert niet.</li>
                  <li>Aanvaard je, dan vul je vanaf dan bij élke boeking in met wie je traint. Voor iemand zonder account volstaat een naam.</li>
                  <li>Weigeren kost je niets. De aanvraag gaat dan terug naar Fittin&rsquo;.</li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionForm action={beantwoordDoorgave} success="Aanvaard ✓">
                    <input type="hidden" name="referralId" value={r.id} />
                    <input type="hidden" name="accept" value="1" />
                    <button className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-brand transition hover:opacity-90">Aanvaarden</button>
                  </ActionForm>
                  <ActionForm action={beantwoordDoorgave} success="Geweigerd ✓">
                    <input type="hidden" name="referralId" value={r.id} />
                    <input type="hidden" name="accept" value="0" />
                    <button className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Weigeren</button>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Aanvaard, maar de klant staat nog niet in het systeem — dus ook nog niet in de lijst hieronder. */}
      {wachtOpAccount.map((r) => (
        <div key={r.id} className="mt-6 rounded-2xl border border-borderc bg-white p-4">
          <p className="font-bold text-brand">Aanvaard, wacht op het account van {r.client_name || r.client_email}</p>
          <p className="mt-1 text-xs text-brand/55">
            Zodra deze persoon een account maakt, verschijnt die bij je verbonden clienten en loopt de aanbreng ({feeZin(r.fee_cents)}). Tot dan wordt er niets aangerekend.
          </p>
          <p className="mt-1 text-xs text-brand/40">{r.client_email}</p>
        </div>
      ))}

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
            const doorgave = doorgaveVan.get(c.id);
            return (
              <div key={l.id} className="rounded-2xl border border-borderc bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-lg font-black text-brand">
                      {c.full_name || c.email}
                      {/* Chip zonder bedrag in beeld: het bedrag staat in de titel, zodat de kaart rustig blijft. */}
                      {doorgave && (
                        <span title={`Door Fittin' doorgegeven — ${feeZin(doorgave.fee_cents)}`} className="rounded-full bg-lav/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand/60">
                          via Fittin&rsquo;
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-brand/45">{c.email}</p>
                  </div>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + ((weekCount[c.id] || 0) > 0 ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/50")}>
                    {weekCount[c.id] || 0} sessies (7d)
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <Mini label="Laatst actief" value={fmtDay(lastActive[c.id])} />
                  <Mini label="Volgende" value={next ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(next.starts_at)) : "—"} />
                  {/* Beurten die deze client bij JOU prepaid heeft (coach_credit_ledger) — niet het gym-tegoed. */}
                  <Mini label="Beurten bij jou" value={creditByClient[c.id] || 0} />
                </div>

                {next && <p className="mt-3 text-xs capitalize text-brand/50">Volgende sessie: {fmt(next.starts_at)} · {next.services?.name}</p>}

                {/* Favorieten: waar bouw je een schema rond dat hij ook echt gaat doen? */}
                {(favByClient[c.id] || []).length > 0 && (
                  <p className="mt-3 text-xs text-brand/60">
                    <span className="font-bold text-brand/45">Doet graag:</span>{" "}
                    {(favByClient[c.id] || []).slice(0, 4).join(" · ")}
                  </p>
                )}
                {/* Los getraind zonder schema = warme aanleiding voor een voorschrift of gesprek. */}
                {(losByClient[c.id] || []).length > 0 && (
                  <p className="mt-1.5 rounded-xl bg-accent/10 px-3 py-2 text-xs font-bold text-accentdark">
                    Traint los: {(losByClient[c.id] || []).slice(0, 3).map((x) => `${x.naam} (${x.n}×)`).join(", ")} — kandidaat voor een schema.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/coach/clienten/${c.id}`} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90">Bekijk client →</Link>
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
