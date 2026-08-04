// Read-only: toont exact wat /beheer/meldingen straks rendert (zelfde query + indeling),
// zodat we niet hoeven te gokken hoe de lijst er voor de owner uitziet.
//   node --env-file=.env.local scripts/preview-meldingen.mjs
import { createClient } from "@supabase/supabase-js";

// Zelfde regels als lib/error-triage.js (die gebruikt de "@/"-alias en is dus niet direct
// importeerbaar vanuit een los node-script).
const NETWERK = ["load failed", "failed to fetch", "networkerror", "network request failed", "the network connection was lost", "the request timed out", "cancelled", "geannuleerd", "err_internet_disconnected", "err_network_changed"];
const EXTERN = ["the object can not be found here", "notfounderror", "failed to execute 'removechild'", "failed to execute 'insertbefore'", "resizeobserver loop", "script error"];
const classify = (message, stack = "") => {
  const m = String(message || "").toLowerCase(), s = String(stack || "").toLowerCase();
  if (NETWERK.some((n) => m.includes(n))) return "netwerk";
  if (EXTERN.some((n) => m.includes(n))) return "extern";
  if (s.includes("removechild") && (m.includes("not be found") || m.includes("not a child"))) return "extern";
  return "app";
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: errors } = await db.from("client_errors")
  .select("message, stack, path, created_at, user_id, resolved_at")
  .gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
  .is("resolved_at", null)
  .order("created_at", { ascending: false }).limit(200);

const byKey = new Map();
for (const e of errors || []) {
  const key = `${e.message}|${e.path}`;
  if (!byKey.has(key)) byKey.set(key, { ...e, count: 0, users: new Set(), last: e.created_at });
  const g = byKey.get(key);
  g.count++;
  if (e.user_id) g.users.add(e.user_id);
}
const groups = [...byKey.values()].map((g) => ({ ...g, kind: classify(g.message, g.stack) }));
const bugs = groups.filter((g) => g.kind === "app");
const ruis = groups.filter((g) => g.kind !== "app");

const line = (g) => `  [×${g.count}] ${String(g.message).slice(0, 70)}\n        ${g.path} · ${g.users.size} gebruiker(s) · laatst ${g.last}`;
console.log(`\n=== FOUTEN IN DE APP (${bugs.length}) — met "✓ Opgelost"-knop ===`);
console.log(bugs.length ? bugs.map(line).join("\n") : "  (geen)");
console.log(`\n=== OMGEVINGSRUIS (${ruis.length}) — dichtgeklapt, geen alarm ===`);
console.log(ruis.length ? ruis.map((g) => line(g) + `\n        → ${g.kind}`).join("\n") : "  (geen)");

const { count: resolved } = await db.from("client_errors").select("id", { count: "exact", head: true }).not("resolved_at", "is", null);
console.log(`\nAl afgevinkt in de database: ${resolved}`);
