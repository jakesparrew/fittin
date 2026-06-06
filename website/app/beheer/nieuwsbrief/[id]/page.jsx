import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { updateNewsletter, deleteCampaign, addDripStep, deleteDripStep, setDripStatus, enrollAllInDrip } from "../../newsletter-actions";
import { SendNewsletterButton, ConfirmSubmit, SendProgress } from "@/components/admin/CampaignControls";

export const dynamic = "force-dynamic";
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) + "%" : "—");
const fmt = (iso) => (iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

export default async function CampaignDetail({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const { data: c } = await supabase.from("campaigns").select("*").eq("id", id).eq("gym_id", gym.id).single();
  if (!c) return <div className="px-8 py-8">Campagne niet gevonden. <Link href="/beheer/nieuwsbrief" className="text-accentdark">Terug</Link></div>;

  const isDrip = c.kind === "drip";
  const { count: subCount } = await supabase.from("subscribers").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "active");

  let steps = [], stepStats = {}, enrolled = 0, completed = 0, active = 0;
  if (isDrip) {
    const [{ data: s }, { data: sends }, { data: enrRows }] = await Promise.all([
      supabase.from("campaign_steps").select("*").eq("campaign_id", id).order("step_no"),
      supabase.from("campaign_sends").select("step_id, status, opened_at").eq("campaign_id", id),
      supabase.from("drip_enrollments").select("status").eq("campaign_id", id),
    ]);
    steps = s || [];
    enrolled = (enrRows || []).length;
    completed = (enrRows || []).filter((e) => e.status === "completed").length;
    active = (enrRows || []).filter((e) => e.status === "active").length;
    for (const row of sends || []) {
      const k = row.step_id || "x";
      (stepStats[k] ||= { total: 0, opened: 0 }).total++;
      if (row.opened_at) stepStats[k].opened++;
    }
  }

  return (
    <div className="px-8 py-8">
      <Link href="/beheer/nieuwsbrief" className="text-sm font-semibold text-brand/50 hover:text-brand">← Campagnes</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">{c.name}</h1>
          <p className="text-sm text-brand/50">{isDrip ? "Drip-campagne" : "Nieuwsbrief"} · status: {c.status}</p>
        </div>
        <ConfirmSubmit action={deleteCampaign} id={c.id} confirm="Deze campagne verwijderen?" label="Verwijderen" danger />
      </div>

      {!isDrip && (
        <>
          {/* Stats (once sent) */}
          {(c.status === "sent" || c.status === "sending") && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Verzonden" value={c.sent} />
              <Stat label="Afgeleverd" value={c.delivered} sub={pct(c.delivered, c.sent)} />
              <Stat label="Geopend" value={c.opened} sub={pct(c.opened, c.sent)} accent />
              <Stat label="Geklikt" value={c.clicked} sub={pct(c.clicked, c.sent)} />
              <Stat label="Bounces" value={c.bounced} sub={pct(c.bounced, c.sent)} />
            </div>
          )}

          {c.status === "sending" && (
            <div className="mt-6">
              <SendProgress id={c.id} initial={{ status: c.status, total: c.total, sent: c.sent }} />
            </div>
          )}

          {c.status === "draft" ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <form action={updateNewsletter} className="rounded-2xl border border-borderc bg-white p-6">
                <input type="hidden" name="id" value={c.id} />
                <h2 className="font-black text-brand">Opstellen</h2>
                <Field label="Titel (intern)" name="name" defaultValue={c.name} />
                <Field label="Onderwerp" name="subject" defaultValue={c.subject} placeholder="Wat staat er in de inbox?" />
                <Field label="Preheader" name="preheader" defaultValue={c.preheader} placeholder="Korte preview-tekst" />
                <label className="mt-3 block">
                  <span className="mb-1 block text-sm font-bold text-brand">Bericht</span>
                  <textarea name="body" defaultValue={c.body_html} rows={12} placeholder="Schrijf je bericht. Lege regel = nieuwe alinea. HTML mag ook." className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
                </label>
                <button className="mt-3 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</button>
              </form>

              <div className="rounded-2xl border border-borderc bg-white p-6">
                <h2 className="font-black text-brand">Voorbeeld & verzenden</h2>
                <div className="mt-3 rounded-xl border border-borderc bg-paper p-4 text-sm text-brand/80">
                  <p className="font-bold text-brand">{c.subject || <span className="text-brand/40">— geen onderwerp —</span>}</p>
                  <div className="mt-2 whitespace-pre-wrap text-brand/70">{(c.body_html || "Nog geen bericht.").replace(/<[^>]+>/g, "")}</div>
                </div>
                <p className="mt-4 text-sm text-brand/60">Wordt verzonden naar <span className="font-black text-brand">{subCount || 0}</span> actieve abonnees vanaf <span className="font-semibold">nieuwsbrief@news.fittin.be</span>.</p>
                <SendNewsletterButton id={c.id} count={subCount || 0} />
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-borderc bg-white p-6">
              <h2 className="font-black text-brand">Bericht</h2>
              <p className="mt-1 text-sm font-bold text-brand">{c.subject}</p>
              <div className="mt-2 text-sm text-brand/70" dangerouslySetInnerHTML={{ __html: c.body_html || "" }} />
              <p className="mt-4 text-xs text-brand/40">Verzonden {fmt(c.sent_at)}.</p>
            </div>
          )}
        </>
      )}

      {isDrip && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-borderc bg-white p-5">
            <div className="flex gap-6">
              <Stat label="Stappen" value={steps.length} bare />
              <Stat label="Gestart" value={enrolled} bare />
              <Stat label="Bezig" value={active} bare />
              <Stat label="Voltooid" value={completed} bare />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {c.status !== "active" ? (
                <>
                  <form action={setDripStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="active" /><button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Activeren (nieuwe inschrijvingen)</button></form>
                  <ConfirmSubmit action={enrollAllInDrip} id={c.id} confirm={`Alle ${subCount || 0} huidige abonnees nu in deze drip inschrijven?`} label="+ Alle huidige abonnees" />
                </>
              ) : (
                <form action={setDripStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="paused" /><button className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand/70">Pauzeren</button></form>
              )}
            </div>
          </div>

          {/* Funnel — hoeveel mensen elke stap bereikten */}
          {steps.length > 0 && enrolled > 0 && (
            <div className="mt-6 rounded-2xl border border-borderc bg-white p-5">
              <p className="font-black text-brand">Voortgang door de reeks</p>
              <p className="mt-0.5 text-xs text-brand/50">Hoeveel ingeschrevenen elke stap (mail) al ontvingen.</p>
              <div className="mt-4 space-y-2.5">
                {steps.map((s) => {
                  const reached = stepStats[s.id]?.total || 0;
                  const w = Math.round((reached / enrolled) * 100);
                  return (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-xs font-bold text-brand/50">#{s.step_no}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-full bg-paper">
                        <div className="flex h-full items-center justify-end rounded-full bg-accent px-2 text-[10px] font-black text-brand transition-all" style={{ width: `${Math.max(w, 6)}%` }}>{reached}</div>
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs font-bold text-brand/40">{w}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {steps.map((s) => (
              <div key={s.id} className="rounded-2xl border border-borderc bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{s.step_no}</span>
                    <div>
                      <p className="font-bold text-brand">{s.subject}</p>
                      <p className="text-xs text-brand/45">{s.delay_hours === 0 ? "Direct bij inschrijving" : `${s.delay_hours}u na inschrijving`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-brand/50">
                    <span>{stepStats[s.id]?.total || 0} verzonden</span>
                    <span>{pct(stepStats[s.id]?.opened || 0, stepStats[s.id]?.total || 0)} open</span>
                    <form action={deleteDripStep}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="campaignId" value={c.id} /><button className="text-red-500 hover:underline">×</button></form>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-brand/60">{(s.body_html || "").replace(/<[^>]+>/g, "")}</p>
              </div>
            ))}
            {steps.length === 0 && <p className="rounded-xl bg-paper p-4 text-sm text-brand/50">Nog geen stappen. Voeg hieronder de eerste mail toe.</p>}
          </div>

          <form action={addDripStep} className="mt-4 rounded-2xl border border-dashed border-borderc bg-white p-5">
            <input type="hidden" name="campaignId" value={c.id} />
            <p className="font-black text-brand">Stap toevoegen</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Vertraging (uren)</span>
                <input name="delay_hours" type="number" min="0" defaultValue={0} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Onderwerp</span>
                <input name="subject" required placeholder="Onderwerp van deze mail" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
              </label>
            </div>
            <textarea name="body" rows={5} placeholder="Bericht van deze stap…" className="mt-3 w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            <button className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">+ Stap toevoegen</button>
          </form>
        </>
      )}
    </div>
  );
}

function Field({ label, name, defaultValue, placeholder }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-sm font-bold text-brand">{label}</span>
      <input name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}

function Stat({ label, value, sub, accent, bare }) {
  if (bare) {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-lav">{label}</p>
        <p className="text-xl font-black text-brand">{value ?? 0}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value ?? 0}</p>
      {sub && <p className="text-xs font-semibold text-brand/40">{sub}</p>}
    </div>
  );
}
