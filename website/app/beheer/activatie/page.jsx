import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEGMENTS, evaluateMatches } from "@/lib/activation";
import ActivationWizard from "@/components/admin/ActivationWizard";
import QuickStart from "@/components/admin/QuickStart";
import { createWinbackPrefabs } from "../activation-actions";

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

      <QuickStart title="Zo werkt een activatie-campagne" steps={[
        { title: "1. Kies wie", body: "Bv. leden die 1 of 2 weken niet kwamen, of wie nog nooit boekte." },
        { title: "2. Kies je aanbod", body: "Een gratis sessie (komt als tegoed op hun account) en/of een kortingscode." },
        { title: "3. Schrijf je bericht", body: "Gebruik {{naam}} voor de voornaam. Zet 'm meteen actief." },
        { title: "Daarna automatisch", body: "Fittin' checkt elke dag wie matcht en stuurt de mail — met respect voor de wachttijd." },
      ]} />

      <ActivationWizard segments={Object.entries(SEGMENTS).map(([key, s]) => ({ key, label: s.label, desc: s.desc, param: s.param ? { key: s.param.key, label: s.param.label, default: s.param.default } : null }))} />

      {/* One-click win-back prefabs (Batch 2.5) — creates two ready-to-review drafts. */}
      <form action={createWinbackPrefabs} className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-borderc bg-paper/50 p-4">
        <div className="flex-1">
          <p className="text-sm font-black text-brand">Snelstart: win-back sjablonen</p>
          <p className="text-xs text-brand/50">Maakt twee kant-en-klare concepten aan — “We missen je” (14d inactief) en “Abonnement gestopt” (+1 gratis sessie). Jij leest ze na en zet ze actief.</p>
        </div>
        <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Sjablonen aanmaken</button>
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
