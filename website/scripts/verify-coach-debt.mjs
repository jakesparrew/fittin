// Controleert of lib/coach-debt.js exact hetzelfde uitrekent als een onafhankelijke telling.
// De schuld wordt nu op twee schermen uit dezelfde functie gehaald; die functie moet dus kloppen.
// Daarom hier een tweede, apart geschreven berekening ernaast — als beide hetzelfde zeggen, is de
// kans op een rekenfout klein. (Zelfde bron, andere weg.)
//
//   node --env-file=.env.local scripts/verify-coach-debt.mjs
import { createClient } from "@supabase/supabase-js";
import { coachDebts, debtReasons } from "../lib/coach-debt.js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const eur = (c) => "€ " + ((c || 0) / 100).toFixed(2);

const { data: gyms } = await db.from("gyms").select("id, name");
let fouten = 0;

for (const gym of gyms || []) {
  const schuld = await coachDebts(db, gym.id);

  // --- onafhankelijke hertelling ---
  const { data: bk, error: e1 } = await db.from("bookings")
    .select("coach_id, coach_charge_cents, coach_billing, coach_invoiced_at, status").eq("gym_id", gym.id);
  const { data: pay, error: e2 } = await db.from("payments")
    .select("user_id, amount_cents, kind, status").eq("gym_id", gym.id);
  const { data: led, error: e3 } = await db.from("coach_ledger").select("coach_id, delta").eq("gym_id", gym.id);
  for (const e of [e1, e2, e3]) if (e) { console.error("query mislukt: " + e.message); process.exit(1); }

  const check = new Map();
  const van = (id) => { if (!check.has(id)) check.set(id, { f: 0, o: 0, n: 0 }); return check.get(id); };
  for (const b of bk || []) {
    if (b.coach_billing === "invoice" && b.status === "bevestigd" && !b.coach_invoiced_at) van(b.coach_id).f += b.coach_charge_cents || 0;
  }
  for (const p of pay || []) {
    if (p.kind === "coach_credits" && p.status === "onbetaald") van(p.user_id).o += p.amount_cents || 0;
  }
  const saldi = new Map();
  for (const l of led || []) saldi.set(l.coach_id, (saldi.get(l.coach_id) || 0) + Number(l.delta || 0));
  for (const [id, s] of saldi) if (s < 0) van(id).n += Math.round(Math.abs(s) * 1200);

  const namen = new Map(((await db.from("profiles").select("id, full_name").eq("gym_id", gym.id)).data || []).map((p) => [p.id, p.full_name]));
  const alleIds = new Set([...schuld.keys(), ...check.keys()]);

  console.log(`\n=== ${gym.name} ===`);
  for (const id of alleIds) {
    const a = schuld.get(id) || { factuurCents: 0, openPostCents: 0, negatiefCents: 0, totaalCents: 0 };
    const b = check.get(id) || { f: 0, o: 0, n: 0 };
    const bTot = b.f + b.o + b.n;
    const ok = a.factuurCents === b.f && a.openPostCents === b.o && a.negatiefCents === b.n && a.totaalCents === bTot;
    if (!ok) fouten++;
    if (a.totaalCents || bTot) {
      console.log(`${ok ? "✓" : "✗ VERSCHIL"}  ${namen.get(id) || id}: ${eur(a.totaalCents)}   [${debtReasons(a).join(" · ") || "—"}]`);
      if (!ok) console.log(`     lib: factuur ${eur(a.factuurCents)} open ${eur(a.openPostCents)} neg ${eur(a.negatiefCents)}\n     her: factuur ${eur(b.f)} open ${eur(b.o)} neg ${eur(b.n)}`);
    }
  }
  const tot = [...schuld.values()].reduce((x, r) => x + r.totaalCents, 0);
  console.log(`TOTAAL openstaand bij coaches: ${eur(tot)}`);
}

console.log(fouten ? `\n✗ ${fouten} verschil(len) gevonden` : "\n✓ beide berekeningen komen exact overeen");
process.exit(fouten ? 1 : 0);
