import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEGMENTS, evaluateMatches } from "@/lib/activation";
import { updateActivation, setActivationStatus, deleteActivation } from "../../activation-actions";
import { RunActivationButton, ConfirmSubmit } from "@/components/admin/CampaignControls";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) + "%" : "—");

export default async function ActivationDetail({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const { data: c } = await supabase.from("campaigns").select("*").eq("id", id).eq("gym_id", gym.id).single();
  if (!c) return <div className="px-4 py-6 md:px-8 md:py-8">Niet gevonden. <Link href="/beheer/activatie" className="text-accentdark">Terug</Link></div>;

  const seg = SEGMENTS[c.trigger_type] || {};
  const admin = createAdminClient();
  const matches = await evaluateMatches(admin, gym.id, c.trigger_type, c.trigger_params);
  const on = c.status === "active";
  const paramVal = seg.param ? c.trigger_params?.[seg.param.key] ?? seg.param.default : "";

  // Per persoon (0165 §13.2): geen totaal zonder de mensen erachter. Wie kreeg wat, deed die iets, en wat werd het?
  const { data: sends } = await admin.from("campaign_sends").select("email, status, sent_at, opened_at, clicked_at")
    .eq("campaign_id", c.id).order("sent_at", { ascending: false }).limit(60);
  const mails = [...new Set((sends || []).map((x) => String(x.email).toLowerCase()))];
  const { data: profs } = mails.length ? await admin.from("profiles").select("id, email, full_name").eq("gym_id", gym.id).in("email", mails) : { data: [] };
  const perMail = new Map((profs || []).map((p) => [String(p.email).toLowerCase(), p]));
  const ids = (profs || []).map((p) => p.id);
  const [{ data: abos }, { data: boekt }] = ids.length ? await Promise.all([
    admin.from("memberships").select("user_id, started_at").in("user_id", ids),
    admin.from("bookings").select("user_id, created_at, starts_at").in("user_id", ids).eq("status", "bevestigd").gte("created_at", (sends || []).at(-1)?.sent_at || new Date().toISOString()),
  ]) : [{ data: [] }, { data: [] }];
  const kort = (iso) => (iso ? new Date(iso).toLocaleDateString("nl-BE", { day: "numeric", month: "short", timeZone: "Europe/Brussels" }) : "");
  const verhalen = (sends || []).map((x) => {
    const p = perMail.get(String(x.email).toLowerCase());
    const na = (iso) => iso && x.sent_at && new Date(iso) > new Date(x.sent_at);
    const abo = p && (abos || []).filter((a) => a.user_id === p.id && na(a.started_at)).sort((a, b) => new Date(a.started_at) - new Date(b.started_at))[0];
    const boeking = p && (boekt || []).filter((b) => b.user_id === p.id && na(b.created_at)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    const resultaat = c.trigger_type === "abo_kandidaat"
      ? (abo ? `abonnement gestart ${kort(abo.started_at)} ✓` : boeking ? `boekte opnieuw ${kort(boeking.created_at)}, nog geen abonnement` : null)
      : (boeking ? `boekte opnieuw ${kort(boeking.created_at)} ✓` : abo ? `abonnement gestart ${kort(abo.started_at)} ✓` : null);
    const volgende = x.sent_at ? new Date(new Date(x.sent_at).getTime() + (c.cooldown_days || 30) * 86400000) : null;
    return { naam: p?.full_name || x.email, id: p?.id, x, resultaat, gelukt: !!resultaat?.endsWith("✓"), volgende };
  });
  const omgezet = verhalen.filter((v) => v.gelukt).length;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/beheer/activatie" className="text-sm font-semibold text-ink/50 hover:text-ink">← Activatie</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink">{c.name}</h1>
          <p className="text-sm text-ink/50">{seg.label} · {on ? "actief" : "concept/gepauzeerd"}</p>
        </div>
        <ConfirmSubmit action={deleteActivation} id={c.id} confirm="Deze campagne verwijderen?" label="Verwijderen" danger />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Matcht nu" value={matches.length} accent />
        <Stat label="Verzonden" value={c.sent || 0} />
        <Stat label="Geopend" value={pct(c.opened, c.sent)} />
        <Stat label="Geklikt" value={pct(c.clicked, c.sent)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Config + compose */}
        <ActionForm action={updateActivation} success="Opgeslagen ✓" className="rounded-2xl border border-borderc bg-surface p-6">
          <input type="hidden" name="id" value={c.id} />
          {seg.param && <input type="hidden" name="param_key" value={seg.param.key} />}
          <h2 className="font-black text-ink">Instellingen</h2>
          <p className="mt-1 text-xs text-ink/50">{seg.desc}</p>

          <Field label="Naam (intern)" name="name" defaultValue={c.name} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {seg.param && (
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-ink">{seg.param.label}</span>
                <input name="param_value" type="number" min="0" defaultValue={paramVal} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-ink">Wachttijd (dagen)</span>
              <input name="cooldown_days" type="number" min="1" defaultValue={c.cooldown_days} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-ink">Gratis sessies erbij</span>
              <input name="reward_credits" type="number" min="0" defaultValue={c.reward_credits} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-ink">Korting (%)</span>
              <input name="discount_percent" type="number" min="0" max="100" defaultValue={c.discount_percent} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
          </div>
          {c.discount_percent > 0 && (
            <p className="mt-2 text-xs text-ink/50">
              Elke ontvanger krijgt een <b>persoonlijke</b> kortingscode van {c.discount_percent}% (alleen bruikbaar door dat lid). Gebruik <code className="rounded bg-paper px-1">{"{{code}}"}</code> in je tekst om ze te tonen.
            </p>
          )}

          <h2 className="mt-6 font-black text-ink">Bericht</h2>
          <p className="mt-1 text-xs text-ink/50">Gebruik <code className="rounded bg-paper px-1">{"{{naam}}"}</code> voor de voornaam en <code className="rounded bg-paper px-1">{"{{rustig}}"}</code> voor de rustige uren van de komende week.</p>
          <Field label="Onderwerp" name="subject" defaultValue={c.subject} placeholder="We missen je, {{naam}}!" />
          <Field label="Preheader" name="preheader" defaultValue={c.preheader} placeholder="Kom je weer langs?" />
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-bold text-ink">Tekst</span>
            <textarea name="body" defaultValue={c.body_html} rows={8} placeholder={"Hey {{naam}},\n\nWe zagen je al even niet in de zaal. Boek je volgende sessie en kom er weer in!"} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <button className="mt-3 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</button>
        </ActionForm>

        {/* Status + run + audience */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-borderc bg-surface p-6">
            <h2 className="font-black text-ink">Verzenden</h2>
            <p className="mt-1 text-sm text-ink/60">
              <span className="font-black text-accentdark">{matches.length}</span> leden voldoen nu aan deze trigger en zijn ingeschreven.
              {c.reward_credits > 0 && <> Ze krijgen <span className="font-bold">{c.reward_credits} gratis sessie{c.reward_credits > 1 ? "s" : ""}</span>.</>}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {on ? (
                <ActionForm action={setActivationStatus} success="Status bijgewerkt ✓"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="paused" /><button className="rounded-full bg-paper px-4 py-2.5 text-sm font-bold text-ink/70">Pauzeren</button></ActionForm>
              ) : (
                <ActionForm action={setActivationStatus} success="Status bijgewerkt ✓"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="active" /><button className="rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white">Activeren (dagelijks)</button></ActionForm>
              )}
              <RunActivationButton id={c.id} matches={matches.length} />
            </div>
            <p className="mt-3 text-xs text-ink/40">Activeren = elke ochtend automatisch versturen. "Nu versturen" doet meteen een ronde (respecteert de wachttijd).</p>
          </div>

          <div className="rounded-2xl border border-borderc bg-surface p-6">
            <h2 className="font-black text-ink">Per persoon <span className="text-xs font-bold text-ink/40">· {omgezet} van {verhalen.length} deden daarna iets</span></h2>
            <div className="mt-3 space-y-2">
              {verhalen.slice(0, 30).map((v, i) => (
                <div key={i} className={"rounded-lg px-3 py-2 text-sm " + (v.gelukt ? "bg-accent/10" : "bg-paper")}>
                  <p className="text-ink">
                    {v.id ? <Link href={`/beheer/leden/${v.id}`} className="font-bold hover:underline">{v.naam}</Link> : <b>{v.naam}</b>}
                    <span className="text-ink/60"> · mail {v.x.status === "failed" ? "NIET vertrokken" : `verstuurd ${kort(v.x.sent_at)}`}
                      {v.x.opened_at && ` → geopend ${kort(v.x.opened_at)}`}
                      {v.x.clicked_at && ` → geklikt ${kort(v.x.clicked_at)}`}
                    </span>
                  </p>
                  <p className={"text-xs " + (v.gelukt ? "font-bold text-accentdark" : "text-ink/50")}>
                    {v.resultaat || `nog geen reactie · volgende mail ten vroegste ${kort(v.volgende)}`}
                  </p>
                </div>
              ))}
              {verhalen.length === 0 && <p className="text-xs text-ink/40">Nog niemand gemaild met deze campagne.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-borderc bg-surface p-6">
            <h2 className="font-black text-ink">Wie matcht nu</h2>
            <div className="mt-3 space-y-1.5">
              {matches.slice(0, 10).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                  <span className="font-semibold text-ink">{m.full_name || m.email}</span>
                  <span className="text-xs text-ink/45">{m.last_visit ? `laatst ${new Date(m.last_visit).toLocaleDateString("nl-BE")}` : "nooit geboekt"}</span>
                </div>
              ))}
              {matches.length === 0 && <p className="text-xs text-ink/40">Niemand matcht op dit moment — mooi, iedereen is actief!</p>}
              {matches.length > 10 && <p className="text-xs text-ink/40">+ {matches.length - 10} meer</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, defaultValue, placeholder }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-sm font-bold text-ink">{label}</span>
      <input name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-ink")}>{value}</p>
    </div>
  );
}
