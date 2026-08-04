// Read-only: groepeer de client-fouten van de laatste 14 dagen met stack + browser.
// De user-agent is hier het belangrijkste veld: "Load failed" en "The object can not be found
// here." zijn WebKit-formuleringen, en dat verandert de diagnose volledig.
//   node --env-file=.env.local scripts/diag-client-errors.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const since = new Date(Date.now() - 14 * 86400000).toISOString();
const { data: rows, error } = await db.from("client_errors")
  .select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(400);
if (error) { console.error(error.message); process.exit(1); }

const browser = (ua = "") => {
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return /Mobile/.test(ua) ? "Chrome mobiel" : "Chrome";
  if (/Safari\//.test(ua)) return /iPhone|iPad/.test(ua) ? "Safari iOS" : "Safari macOS";
  return ua.slice(0, 40) || "?";
};

const groups = new Map();
for (const r of rows || []) {
  const key = (r.message || "").slice(0, 90);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

console.log(`${rows.length} fouten in 14 dagen · ${groups.size} soorten\n`);
for (const [msg, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const paths = [...new Set(list.map((r) => r.path))];
  const browsers = [...new Set(list.map((r) => browser(r.ua)))];
  const users = new Set(list.map((r) => r.user_id).filter(Boolean));
  console.log(`\n${"=".repeat(78)}\n[${list.length}×] ${msg}`);
  console.log(`  paden   : ${paths.join(", ")}`);
  console.log(`  browsers: ${browsers.join(", ")}`);
  console.log(`  users   : ${users.size} ingelogd, ${list.filter((r) => !r.user_id).length} anoniem`);
  console.log(`  laatst  : ${list[0].created_at}  ·  eerst: ${list[list.length - 1].created_at}`);
  const withStack = list.find((r) => r.stack);
  if (withStack) console.log(`  stack   :\n${String(withStack.stack).split("\n").slice(0, 8).map((l) => "      " + l).join("\n")}`);
  else console.log("  stack   : (geen)");
  console.log(`  volledige UA: ${list[0].ua}`);
}
