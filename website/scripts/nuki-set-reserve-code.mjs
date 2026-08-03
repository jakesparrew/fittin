// Zet de permanente RESERVECODE op het Nuki-keypad via de Web API — dezelfde endpoint die de app
// al gebruikt voor per-boeking-codes. Idempotent: bestaat er al een auth met deze naam, dan wordt
// die eerst verwijderd zodat er nooit twee reservecodes naast elkaar leven.
//
//   node --env-file=.env.local scripts/nuki-set-reserve-code.mjs 676767
//   node --env-file=.env.local scripts/nuki-set-reserve-code.mjs --check      (enkel controleren)
//
// Verifieert achteraf door de auth terug te lezen: naam, code, enabled en of er geen einddatum op
// staat. Wat dit NIET kan bewijzen is of de code fysiek werkt op het paneel — dat vergt één keer
// intoetsen aan de deur.
// BEWUST niet beginnend met "Fittin " — reconcileKeypadCodes() ruimt élke "Fittin …"-keypadauth op
// waarvan het geldigheidsvenster verstreken is. Vandaag overleeft een permanente code dat (geen
// einddatum → geen sweep), maar zo hangt het voortbestaan van het vangnet af van één null-check in
// opruimcode. Buiten die naamruimte blijven is gratis en veel steviger.
const RESERVE_NAME = "Reservecode (app)";
const LEGACY_NAMES = ["Fittin reservecode"];
const KEYPAD_TYPE = 13;

import { createClient } from "@supabase/supabase-js";

const arg = (process.argv[2] || "").trim();
const checkOnly = arg === "--check";
if (!checkOnly && !/^[1-9]{6}$/.test(arg)) {
  console.error("Geef een geldige Nuki-PIN mee: 6 cijfers, elk 1-9 (geen 0). Bv: 676767");
  process.exit(1);
}
if (!checkOnly && arg.startsWith("12")) {
  console.error("Nuki weigert codes die met '12' beginnen.");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: cfg } = await db.from("gym_integrations")
  .select("nuki_api_token, nuki_smartlock_id, access_code").not("nuki_api_token", "is", null).limit(1).maybeSingle();
if (!cfg?.nuki_api_token) { console.error("Geen Nuki-token in gym_integrations."); process.exit(1); }

const H = { Authorization: `Bearer ${cfg.nuki_api_token}`, "Content-Type": "application/json" };
const base = `https://api.nuki.io/smartlock/${cfg.nuki_smartlock_id}`;
const listAuths = async () => {
  const r = await fetch(`${base}/auth`, { headers: H });
  if (!r.ok) throw new Error(`GET /auth → ${r.status}`);
  return r.json();
};

let auths = await listAuths();
const keypad = auths.filter((a) => a.type === KEYPAD_TYPE);
const existing = keypad.filter((a) => a.name === RESERVE_NAME || LEGACY_NAMES.includes(a.name));
const report = (a) => `id=${a.id} code=${a.code} enabled=${a.enabled} tot=${a.allowedUntilDate || "(geen einddatum)"}`;

if (checkOnly) {
  console.log(existing.length ? existing.map(report).join("\n") : `Geen auth met naam "${RESERVE_NAME}" op het slot.`);
  console.log(`In de app opgeslagen (gym_integrations.access_code): ${cfg.access_code || "(leeg)"}`);
  process.exit(0);
}

// Botst de gewenste code met een BESTAANDE code van iemand anders? Nuki weigert duplicaten, en we
// willen zeker niet stilletjes andermans code overnemen. Codes worden nooit geprint.
// Onze eigen (ook hernoemde) reservecode telt niet als botsing — die wordt hieronder vervangen.
const isOurs = (a) => a.name === RESERVE_NAME || LEGACY_NAMES.includes(a.name);
const clash = keypad.find((a) => String(a.code) === arg && !isOurs(a));
if (clash) {
  console.error(`De code is al in gebruik door "${clash.name}". Kies een andere.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

for (const a of existing) {
  const d = await fetch(`${base}/auth/${a.id}`, { method: "DELETE", headers: H });
  console.log(`oude reservecode verwijderd (${a.id}, naam "${a.name}") → ${d.status}`);
}
// Verwijderen is bij Nuki asynchroon: de DELETE geeft 204 terug terwijl de PIN nog even bezet
// blijft, en een meteen volgende PUT botst dan op 409 "code exists already". Wachten tot de code
// echt uit de lijst verdwenen is — anders staat er na een hernoeming even GEEN reservecode.
if (existing.length) {
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const now = await listAuths();
    if (!now.some((a) => a.type === KEYPAD_TYPE && String(a.code) === arg)) break;
    if (i === 19) console.log("⚠ oude code hangt nog in de lijst — PUT kan alsnog 409 geven");
  }
}

const body = { name: RESERVE_NAME, type: KEYPAD_TYPE, code: Number(arg), remoteAllowed: false };
let r;
for (let attempt = 0; attempt < 8; attempt++) {
  r = await fetch(`${base}/auth`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  if (r.ok) break;
  const txt = await r.text();
  console.log(`PUT /auth → ${r.status}${txt.includes("exists already") ? " (code nog bezet, opnieuw…)" : " — " + txt.slice(0, 160)}`);
  if (!txt.includes("exists already")) process.exit(1);
  await sleep(3000);
}
console.log(`PUT /auth → ${r.status}`);
if (!r.ok) { console.error("Aanmaken mislukt na meerdere pogingen."); process.exit(1); }

// Nuki's create is asynchroon (leeg antwoord, geen id terug) — daarom teruglezen tot ze verschijnt.
let found = null;
for (let i = 0; i < 10 && !found; i++) {
  await new Promise((s) => setTimeout(s, 1500));
  auths = await listAuths();
  found = auths.find((a) => a.type === KEYPAD_TYPE && a.name === RESERVE_NAME);
}
if (!found) { console.error("⚠ De code verscheen niet terug in de lijst — NIET aangemaakt."); process.exit(1); }

console.log("\n✓ staat op het slot:", report(found));
console.log(`  code klopt met wat gevraagd was: ${String(found.code) === arg ? "ja" : "NEE (!)"}`);
console.log(`  permanent (geen einddatum): ${found.allowedUntilDate ? "NEE (!)" : "ja"}`);
console.log(`  in de app opgeslagen: ${cfg.access_code === arg ? "ja, identiek" : `⚠ app heeft "${cfg.access_code || "(leeg)"}"`}`);
