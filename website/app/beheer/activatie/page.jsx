import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEGMENTS, evaluateMatches } from "@/lib/activation";
import { createActivation } from "../activation-actions";

export const dynamic = "force-dynamic";
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) + "%" : "—");
const fmt = (iso) => (iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "nog niet");

export default async function Activatie() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const { data: camps } = await supabase.from("campaigns").select("*").eq("gym_id", gym.id).eq("kind", "activation").order("created_at", { ascending: false });

  // Live "matches now" per campaign (service role → reads the engagement view).
  const admin = createAdminClient();
  const matchCounts = {};
  await Promise.all(
    (camps || []).map(async (c) => {
      matchCounts[c.id] = (await evaluateMatches(admin, gym.id, c.trigger_type, c.trigger_params)).length;
    })
  );

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Activatie</h1>
      <p className="mt-1 text-sm text-brand/50">Motivatie-campagnes die automatisch leden activeren — bv. wie 10 dagen niet kwam, krijgt een duwtje.</p>

      <div className="mt-5 rounded-2xl border border-borderc bg-accent/5 p-4 text-sm text-brand/70">
        Elke dag checkt Fittin&rsquo; automatisch wie aan een campagne voldoet en stuurt de mail. Een lid krijgt dezelfde campagne pas opnieuw na de ingestelde wachttijd.
      </div>

      <form action={createActivation} className="mt-6 rounded-2xl border border-borderc bg-white p-5">
        <p className="font-black text-brand">Nieuwe activatie-campagne</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Trigger</span>
            <select name="trigger_type" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm">
              {Object.entries(SEGMENTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <input name="name" required placeholder="Naam (bv. We missen je)" className="flex-1 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
          <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Aanmaken</button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {(camps || []).map((c) => {
          const seg = SEGMENTS[c.trigger_type];
          const on = c.status === "active";
          return (
            <Link key={c.id} href={`/beheer/activatie/${c.id}`} className="block rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={"inline-block h-2 w-2 rounded-full " + (on ? "bg-accent" : "bg-borderc")} />
                    <p className="font-black text-brand">{c.name}</p>
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-brand/60">{seg?.label || c.trigger_type}</span>
                  </div>
                  <p className="mt-1 text-xs text-brand/45">{on ? "Actief — draait dagelijks" : "Concept / gepauzeerd"} · laatste run {fmt(c.last_run_at)}{c.reward_credits > 0 ? ` · +${c.reward_credits} gratis sessie` : ""}</p>
                </div>
                <div className="flex gap-5 text-right text-sm">
                  <div><p className="text-lg font-black text-accentdark">{matchCounts[c.id] ?? 0}</p><p className="text-xs text-brand/45">matcht nu</p></div>
                  <div><p className="text-lg font-black text-brand">{c.sent || 0}</p><p className="text-xs text-brand/45">verzonden</p></div>
                  <div><p className="text-lg font-black text-brand">{pct(c.opened, c.sent)}</p><p className="text-xs text-brand/45">open</p></div>
                </div>
              </div>
            </Link>
          );
        })}
        {(!camps || camps.length === 0) && <p className="rounded-xl bg-paper p-4 text-sm text-brand/50">Nog geen activatie-campagnes. Maak hierboven je eerste — bv. een win-back voor wie 10 dagen niet kwam.</p>}
      </div>
    </div>
  );
}
