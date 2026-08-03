import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProblemReport } from "../actions";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Two feedback streams in one place: deliberate member reports ("de deur ging niet open")
// and automatic client-side JS errors (window.onerror → /api/log-error → client_errors).
export default async function Meldingen() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const admin = createAdminClient();

  const [{ data: reports }, { data: errors }] = await Promise.all([
    supabase
      .from("problem_reports")
      .select("id, message, page, status, created_at, member:profiles!problem_reports_user_id_fkey(full_name, email)")
      .eq("gym_id", gym.id)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("client_errors")
      .select("message, stack, path, ua, created_at, user_id")
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

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

  const open = (reports || []).filter((r) => r.status === "open");
  const done = (reports || []).filter((r) => r.status !== "open");
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
        Problemen gemeld door leden (via “🛟 Werkt iets niet?” op hun account) én automatische foutlogs uit de app.
      </p>

      {/* Samenvatting bovenaan: wie via "Client-fouten" binnenkomt, ziet meteen waar de inhoud zit —
          voorheen begon de pagina met een grote lege "Van leden"-staat en leken de foutlogs onvindbaar. */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className={"rounded-full px-3.5 py-1.5 " + (open.length ? "bg-amber-100 text-amber-700" : "bg-white text-brand/50 border border-borderc")}>Van leden: {open.length} open</span>
        <a href="#foutlogs" className={"rounded-full px-3.5 py-1.5 transition hover:opacity-80 " + ((errors || []).length ? "bg-brand text-white" : "bg-white text-brand/50 border border-borderc")}>Foutlogs (7d): {(errors || []).length} ↓</a>
      </div>

      {/* ---- Member reports ---- */}
      <section className="mt-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Van leden{open.length ? ` · ${open.length} open` : ""}</h2>
        {(reports || []).length === 0 && (
          <p className="mt-3 text-sm text-brand/40">Nog geen meldingen van leden — zij vinden de meldknop onderaan hun account-pagina.</p>
        )}
        <div className="mt-3 space-y-2">
          {open.map((r) => (
            <div key={r.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-brand">{r.member?.full_name || "Lid"} <span className="font-semibold text-brand/40">· {fmt(r.created_at)}{r.page ? ` · ${r.page}` : ""}</span></p>
                  <p className="mt-1 text-sm text-brand/80">{r.message}</p>
                  {r.member?.email && <a href={`mailto:${r.member.email}`} className="mt-1 inline-block text-xs font-bold text-accentdark hover:underline">Antwoord {r.member.email} →</a>}
                </div>
                <ActionForm action={resolveProblemReport} className="shrink-0">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90">✓ Afgehandeld</button>
                </ActionForm>
              </div>
            </div>
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
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Automatische foutlogs (7 dagen) · {(errors || []).length}</h2>
        <p className="mt-1 text-xs text-brand/45">JS-fouten uit de browser van bezoekers, automatisch gelogd — geen actie van het lid nodig. Vaak technisch; kijk vooral naar herhaling.</p>
        {(errors || []).length === 0 ? (
          <p className="mt-3 rounded-2xl border border-borderc bg-white p-5 text-sm text-brand/50">Geen client-fouten de afgelopen 7 dagen. 🎉</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-borderc bg-white">
            {groups.map((g, i) => (
              <div key={i} className="border-b border-borderc px-5 py-3 text-sm last:border-0">
                <p className="flex flex-wrap items-center gap-2">
                  {g.count > 1 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">×{g.count}</span>}
                  <span className="min-w-0 break-all font-mono text-xs text-brand/80">{g.message}</span>
                </p>
                <p className="mt-0.5 text-xs text-brand/40">
                  laatst {fmt(g.last)}{g.path ? ` · ${g.path}` : ""} · {g.users.size > 0 ? `${g.users.size} ${g.users.size === 1 ? "gebruiker" : "gebruikers"}${g.users.size === 1 ? ` (${nameById[[...g.users][0]] || "ingelogd"})` : ""}` : "anoniem"}
                </p>
                {g.stack && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] font-bold text-brand/40 hover:text-brand">stacktrace</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-paper p-2 text-[10px] leading-relaxed text-brand/60">{g.stack}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
