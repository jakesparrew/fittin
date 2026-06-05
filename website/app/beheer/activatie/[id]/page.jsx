import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEGMENTS, evaluateMatches } from "@/lib/activation";
import { updateActivation, setActivationStatus, deleteActivation } from "../../activation-actions";
import { RunActivationButton, ConfirmSubmit } from "@/components/admin/CampaignControls";

export const dynamic = "force-dynamic";
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) + "%" : "—");

export default async function ActivationDetail({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const { data: c } = await supabase.from("campaigns").select("*").eq("id", id).eq("gym_id", gym.id).single();
  if (!c) return <div className="px-8 py-8">Niet gevonden. <Link href="/beheer/activatie" className="text-accentdark">Terug</Link></div>;

  const seg = SEGMENTS[c.trigger_type] || {};
  const admin = createAdminClient();
  const matches = await evaluateMatches(admin, gym.id, c.trigger_type, c.trigger_params);
  const on = c.status === "active";
  const paramVal = seg.param ? c.trigger_params?.[seg.param.key] ?? seg.param.default : "";

  return (
    <div className="px-8 py-8">
      <Link href="/beheer/activatie" className="text-sm font-semibold text-brand/50 hover:text-brand">← Activatie</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">{c.name}</h1>
          <p className="text-sm text-brand/50">{seg.label} · {on ? "actief" : "concept/gepauzeerd"}</p>
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
        <form action={updateActivation} className="rounded-2xl border border-borderc bg-white p-6">
          <input type="hidden" name="id" value={c.id} />
          {seg.param && <input type="hidden" name="param_key" value={seg.param.key} />}
          <h2 className="font-black text-brand">Instellingen</h2>
          <p className="mt-1 text-xs text-brand/50">{seg.desc}</p>

          <Field label="Naam (intern)" name="name" defaultValue={c.name} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {seg.param && (
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-brand">{seg.param.label}</span>
                <input name="param_value" type="number" min="0" defaultValue={paramVal} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-brand">Wachttijd (dagen)</span>
              <input name="cooldown_days" type="number" min="1" defaultValue={c.cooldown_days} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-brand">Gratis sessies erbij</span>
              <input name="reward_credits" type="number" min="0" defaultValue={c.reward_credits} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
            </label>
          </div>

          <h2 className="mt-6 font-black text-brand">Bericht</h2>
          <p className="mt-1 text-xs text-brand/50">Gebruik <code className="rounded bg-paper px-1">{"{{naam}}"}</code> voor de voornaam.</p>
          <Field label="Onderwerp" name="subject" defaultValue={c.subject} placeholder="We missen je, {{naam}}!" />
          <Field label="Preheader" name="preheader" defaultValue={c.preheader} placeholder="Kom je weer langs?" />
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-bold text-brand">Tekst</span>
            <textarea name="body" defaultValue={c.body_html} rows={8} placeholder={"Hey {{naam}},\n\nWe zagen je al even niet in de zaal. Boek je volgende sessie en kom er weer in!"} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <button className="mt-3 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</button>
        </form>

        {/* Status + run + audience */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Verzenden</h2>
            <p className="mt-1 text-sm text-brand/60">
              <span className="font-black text-accentdark">{matches.length}</span> leden voldoen nu aan deze trigger en zijn ingeschreven.
              {c.reward_credits > 0 && <> Ze krijgen <span className="font-bold">{c.reward_credits} gratis sessie{c.reward_credits > 1 ? "s" : ""}</span>.</>}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {on ? (
                <form action={setActivationStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="paused" /><button className="rounded-full bg-paper px-4 py-2.5 text-sm font-bold text-brand/70">Pauzeren</button></form>
              ) : (
                <form action={setActivationStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="active" /><button className="rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white">Activeren (dagelijks)</button></form>
              )}
              <RunActivationButton id={c.id} matches={matches.length} />
            </div>
            <p className="mt-3 text-xs text-brand/40">Activeren = elke ochtend automatisch versturen. "Nu versturen" doet meteen een ronde (respecteert de wachttijd).</p>
          </div>

          <div className="rounded-2xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Wie matcht nu</h2>
            <div className="mt-3 space-y-1.5">
              {matches.slice(0, 10).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
                  <span className="font-semibold text-brand">{m.full_name || m.email}</span>
                  <span className="text-xs text-brand/45">{m.last_visit ? `laatst ${new Date(m.last_visit).toLocaleDateString("nl-BE")}` : "nooit geboekt"}</span>
                </div>
              ))}
              {matches.length === 0 && <p className="text-xs text-brand/40">Niemand matcht op dit moment — mooi, iedereen is actief!</p>}
              {matches.length > 10 && <p className="text-xs text-brand/40">+ {matches.length - 10} meer</p>}
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
      <span className="mb-1 block text-sm font-bold text-brand">{label}</span>
      <input name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
    </div>
  );
}
