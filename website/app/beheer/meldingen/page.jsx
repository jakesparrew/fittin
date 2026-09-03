import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProblemReport, resolveClientError } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import { classifyClientError, explainClass } from "@/lib/error-triage";
import ListSearch from "@/components/admin/ListSearch";
import ProblemReply from "@/components/admin/ProblemReply";
import MeldingKaart from "@/components/admin/MeldingKaart";
import { vorigeGebruiker } from "@/lib/meldpunt";

export const dynamic = "force-dynamic";

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Two feedback streams in one place: deliberate member reports ("de deur ging niet open")
// and automatic client-side JS errors (window.onerror → /api/log-error → client_errors).
export default async function Meldingen({ searchParams }) {
  const zoek = String((await searchParams)?.q || "").trim().toLowerCase();
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const admin = createAdminClient();

  const [{ data: reports }, { data: errors }] = await Promise.all([
    supabase
      .from("problem_reports")
      .select("id, message, page, status, created_at, category, photo_path, booking_id, acknowledged_at, public_note, resolved_note, resolved_at, booking:bookings(starts_at), member:profiles!problem_reports_user_id_fkey(full_name, email)")
      .eq("gym_id", gym.id)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("client_errors")
      .select("message, stack, path, ua, created_at, user_id, resolved_at")
      .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // Eén zoekveld dat beide stromen filtert: je zoekt hier op de naam van een lid ("wat had
  // Laura gemeld?") of op een stuk foutmelding.
  const raakt = (velden) => !zoek || velden.some((v) => String(v || "").toLowerCase().includes(zoek));

  // Groepeer identieke fouten (zelfde message + pagina): "×6 · 3 gebruikers" zegt meer dan zes
  // losse rijen — herhaling is hét signaal waar de owner op moet letten.
  const groups = [];
  {
    const byKey = new Map();
    for (const e of errors || []) {
      const key = `${e.message}|${e.path}`;
      if (!byKey.has(key)) { byKey.set(key, { ...e, count: 0, users: new Set(), last: e.created_at }); groups.push(byKey.get(key)); }
      const g = byKey.get(key);
      g.count++;
      if (e.user_id) g.users.add(e.user_id);
    }
  }
  // Splits wat je kán oplossen van wat buiten de app ligt. Een lijst waarin een echte bug
  // tussen tien "verbinding weggevallen"-regels staat, wordt in z'n geheel genegeerd.
  for (const g of groups) g.kind = classifyClientError(g.message, g.stack);
  const zichtbaar = groups.filter((g) => raakt([g.message, g.path, g.stack]));
  const bugs = zichtbaar.filter((g) => g.kind === "app");
  const ruis = zichtbaar.filter((g) => g.kind !== "app");

  const alleReports = (reports || []).filter((r) => raakt([r.member?.full_name, r.member?.email, r.message, r.page]));
  const open = alleReports.filter((r) => !r.resolved_at && r.status === "open");
  const done = alleReports.filter((r) => r.resolved_at || r.status !== "open");

  // Foto's staan in een PRIVÉ-bak (0150): een foto van een vuile kleedkamer of een kapot toestel
  // kan mensen bevatten en hoort niet achter een raadbare publieke URL. Ondertekende links van
  // een uur, alleen voor dit scherm.
  const fotoUrls = {};
  for (const r of open) {
    if (!r.photo_path) continue;
    try {
      const { data } = await admin.storage.from("meldingen").createSignedUrl(r.photo_path, 3600);
      if (data?.signedUrl) fotoUrls[r.id] = data.signedUrl;
    } catch {}
  }
  // Wie had de zaal vóór deze sessie? Enkel opgezocht bij netheid — daar is het de relevante
  // vraag, en enkel de uitbater ziet het.
  const vorigen = {};
  for (const r of open) {
    if (r.category !== "netheid" || !r.booking?.starts_at) continue;
    vorigen[r.id] = await vorigeGebruiker(admin, gym.id, r.booking.starts_at, r.booking_id);
  }
  // Resolve names for automatic errors that carried a logged-in user.
  const errUserIds = [...new Set((errors || []).map((e) => e.user_id).filter(Boolean))];
  const nameById = {};
  if (errUserIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", errUserIds);
    for (const p of profs || []) nameById[p.id] = p.full_name;
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Meldingen</h1>
      <p className="mt-1 text-sm text-brand/50">
        Problemen gemeld door leden — vanuit hun deurcodemail, met categorie en foto — én automatische foutlogs uit de app.
      </p>

      {/* Samenvatting bovenaan: wie via "Client-fouten" binnenkomt, ziet meteen waar de inhoud zit —
          voorheen begon de pagina met een grote lege "Van leden"-staat en leken de foutlogs onvindbaar. */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className={"rounded-full px-3.5 py-1.5 " + (open.length ? "bg-amber-100 text-amber-700" : "bg-white text-brand/50 border border-borderc")}>Van leden: {open.length} open</span>
        <a href="#foutlogs" className={"rounded-full px-3.5 py-1.5 transition hover:opacity-80 " + (bugs.length ? "bg-brand text-white" : "bg-white text-brand/50 border border-borderc")}>Fouten in de app: {bugs.length} ↓</a>
        {ruis.length > 0 && <span className="rounded-full border border-borderc bg-white px-3.5 py-1.5 text-brand/40">Omgevingsruis: {ruis.length}</span>}
      </div>

      <div className="mt-4">
        <ListSearch placeholder="Zoek op naam van het lid of op foutmelding…" className="w-full max-w-md" />
      </div>

      {/* ---- Member reports ---- */}
      <section className="mt-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Van leden{open.length ? ` · ${open.length} open` : ""}</h2>
        {alleReports.length === 0 && (
          <p className="mt-3 text-sm text-brand/40">
            {zoek
              ? `Geen melding van een lid gevonden voor “${zoek}”.`
              : "Nog geen meldingen van leden. De meldlink staat onderaan elke deurcodemail."}
          </p>
        )}
        <div className="mt-3 space-y-2">
          {open.map((r) => (
            <MeldingKaart key={r.id} melding={r} fotoUrl={fotoUrls[r.id]} vorige={vorigen[r.id]} />
          ))}
          {done.length > 0 && (
            <details className="rounded-2xl border border-borderc bg-white p-4">
              <summary className="cursor-pointer text-sm font-bold text-brand/60">Afgehandeld ({done.length})</summary>
              <div className="mt-3 space-y-2">
                {done.map((r) => (
                  <div key={r.id} className="rounded-xl bg-paper px-4 py-3 text-sm">
                    <p className="font-bold text-brand/70">{r.member?.full_name || "Lid"} <span className="font-semibold text-brand/40">· {fmt(r.created_at)}</span></p>
                    <p className="mt-0.5 text-brand/60">{r.message}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ---- Automatic client errors ---- */}
      <section id="foutlogs" className="mt-8 scroll-mt-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Fouten in de app (14 dagen) · {bugs.length}</h2>
        <p className="mt-1 text-xs text-brand/45">
          Automatisch gelogde JS-fouten waar wél iets aan te doen valt. Vink een fout af zodra ze
          gerepareerd is — komt ze daarna terug, dan verschijnt ze vanzelf opnieuw.
        </p>
        {bugs.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-accent/40 bg-accent/5 p-5 text-sm font-semibold text-accentdark">Geen openstaande app-fouten. 🎉</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-borderc bg-white">
            {bugs.map((g, i) => <ErrGroup key={i} g={g} nameById={nameById} resolvable />)}
          </div>
        )}

        {/* Ruis apart en dichtgeklapt: wegmoffelen zou een échte storing verbergen, maar tussen de
            bugs zetten zorgt ervoor dat de hele lijst genegeerd wordt. */}
        {ruis.length > 0 && (
          <details className="mt-4 rounded-2xl border border-borderc bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-brand/60">
              Omgevingsruis ({ruis.length}) — verbindingsproblemen &amp; browserextensies
            </summary>
            <p className="mt-2 text-xs text-brand/45">
              Hier valt vanuit de code niets aan te repareren. Alleen een plotse golf is een signaal:
              dan is er waarschijnlijk wél iets mis met de site of de hosting.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-borderc">
              {ruis.map((g, i) => <ErrGroup key={i} g={g} nameById={nameById} muted />)}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

// Eén gegroepeerde fout. `resolvable` toont de afvinkknop (alleen zinvol bij echte app-fouten:
// netwerkruis "oplossen" zou een knop zijn die niets betekent).
function ErrGroup({ g, nameById, resolvable = false, muted = false }) {
  const uitleg = explainClass(g.kind);
  return (
    <div className={"border-b border-borderc px-5 py-3 text-sm last:border-0 " + (muted ? "bg-paper/40" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            {g.count > 1 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">×{g.count}</span>}
            <span className={"min-w-0 break-all font-mono text-xs " + (muted ? "text-brand/50" : "text-brand/80")}>{g.message}</span>
          </p>
          <p className="mt-0.5 text-xs text-brand/40">
            laatst {fmt(g.last)}{g.path ? ` · ${g.path}` : ""} · {g.users.size > 0 ? `${g.users.size} ${g.users.size === 1 ? "gebruiker" : "gebruikers"}${g.users.size === 1 ? ` (${nameById[[...g.users][0]] || "ingelogd"})` : ""}` : "anoniem"}
          </p>
          {uitleg && <p className="mt-1 text-xs text-brand/45">{uitleg}</p>}
        </div>
        <ActionForm action={resolveClientError} className="shrink-0">
          <input type="hidden" name="message" value={g.message} />
          <input type="hidden" name="path" value={g.path || ""} />
          <button className={"rounded-full px-3 py-1.5 text-xs font-bold transition " + (resolvable ? "bg-brand text-white hover:opacity-90" : "border border-borderc bg-white text-brand/50 hover:border-lav")}>
            {resolvable ? "✓ Opgelost" : "Verbergen"}
          </button>
        </ActionForm>
      </div>
      {g.stack && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] font-bold text-brand/40 hover:text-brand">stacktrace</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-paper p-2 text-[10px] leading-relaxed text-brand/60">{g.stack}</pre>
        </details>
      )}
    </div>
  );
}
