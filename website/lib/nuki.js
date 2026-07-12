import crypto from "crypto";

// Nuki Web API client. SERVER ONLY (uses the secret API token).
// Docs: https://developer.nuki.io — auth `Authorization: Bearer <token>`, base https://api.nuki.io.
const NUKI_BASE = "https://api.nuki.io";
const KEYPAD_TYPE = 13; // auth type for a keypad PIN code

// Resolve a gym's Nuki config: gym_integrations row (service-role) first, env vars as fallback.
// `admin` must be a service-role client (createAdminClient) — gym_integrations has no RLS policies.
export async function getNukiConfig(admin, gymId) {
  let row = null;
  if (gymId) {
    try {
      const { data } = await admin.from("gym_integrations").select("*").eq("gym_id", gymId).maybeSingle();
      row = data;
    } catch {}
  }
  const token = (row?.nuki_api_token || process.env.NUKI_API_TOKEN || "").trim() || null;
  const smartlockId = (row?.nuki_smartlock_id || process.env.NUKI_SMARTLOCK_ID || "").trim() || null;
  return {
    token,
    smartlockId,
    leadMin: row?.keypad_lead_min ?? 5,
    graceMin: row?.keypad_grace_min ?? 15,
    hasToken: !!token,
    hasLock: !!smartlockId,
    // The per-booking keypad-code feature is "on" only when explicitly enabled AND fully configured.
    enabled: !!(row?.nuki_enabled && token && smartlockId),
  };
}

function nukiFetch(cfg, path, { method = "GET", body } = {}) {
  return fetch(`${NUKI_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// A valid Nuki keypad PIN: 6 digits from 1-9 (no 0) and not starting with "12".
export function genKeypadCode() {
  for (;;) {
    let s = "";
    for (let i = 0; i < 6; i++) s += String(crypto.randomInt(1, 10)); // 1..9
    if (!s.startsWith("12")) return s;
  }
}

export async function listAuths(cfg) {
  const r = await nukiFetch(cfg, `/smartlock/${cfg.smartlockId}/auth`);
  if (!r.ok) return [];
  try {
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function deleteAuth(cfg, authId) {
  return nukiFetch(cfg, `/smartlock/${cfg.smartlockId}/auth/${authId}`, { method: "DELETE" });
}

// Remove every keypad authorization carrying this exact name (used on reschedule, retry and cleanup).
export async function revokeByName(cfg, name) {
  if (!name) return;
  const list = await listAuths(cfg);
  for (const a of list) {
    if (a?.name === name && a?.id != null) {
      try { await deleteAuth(cfg, a.id); } catch {}
    }
  }
}

// Create the time-boxed keypad PIN for a booking. Revokes any earlier code for the same booking
// first (reschedule / retry), then tries fresh random PINs until one is accepted — Nuki rejects a
// PIN already in use, so a collision just means we retry. Persists the code + name on the booking.
export async function ensureBookingKeypadCode(admin, cfg, booking) {
  const name = `Fittin ${String(booking.id).slice(0, 8)}`;
  // Persist the (deterministic) auth name BEFORE creating, so a partial failure (code lands on the
  // lock but the DB write fails) still leaves a name the cleanup/reconcile pass can match.
  await admin.from("bookings").update({ nuki_auth_name: name }).eq("id", booking.id);
  await revokeByName(cfg, name);
  const fromDate = new Date(new Date(booking.starts_at).getTime() - cfg.leadMin * 60000).toISOString();
  const untilDate = new Date(new Date(booking.ends_at).getTime() + cfg.graceMin * 60000).toISOString();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genKeypadCode();
    const r = await nukiFetch(cfg, `/smartlock/${cfg.smartlockId}/auth`, {
      method: "PUT",
      body: { name, type: KEYPAD_TYPE, code: Number(code), allowedFromDate: fromDate, allowedUntilDate: untilDate, allowedWeekDays: 0 },
    });
    if (r.ok) {
      await admin.from("bookings").update({ nuki_code: code, nuki_auth_name: name, nuki_cleaned: false }).eq("id", booking.id);
      return code;
    }
    lastStatus = r.status;
  }
  throw new Error(`Nuki keypad create failed (status ${lastStatus})`);
}

// Remove keypad codes for bookings that have ended (+grace) or were cancelled. Idempotent; safe to
// run every few minutes. Leaves codes alone if the lock can't be reached (retried next pass).
export async function revokeExpiredKeypadCodes(admin) {
  const { data: rows } = await admin
    .from("bookings")
    .select("id, gym_id, status, ends_at, nuki_auth_name")
    .not("nuki_code", "is", null)
    .eq("nuki_cleaned", false)
    .limit(500);
  let revoked = 0;
  const cfgCache = {};
  for (const b of rows || []) {
    const cfg = cfgCache[b.gym_id] || (cfgCache[b.gym_id] = await getNukiConfig(admin, b.gym_id));
    if (!cfg.hasToken || !cfg.hasLock) continue; // can't reach the lock → leave for a later pass
    const ended = new Date(b.ends_at).getTime() + cfg.graceMin * 60000 < Date.now();
    const cancelled = b.status !== "bevestigd";
    if (!ended && !cancelled) continue;
    try { await revokeByName(cfg, b.nuki_auth_name); } catch {}
    await admin.from("bookings").update({ nuki_cleaned: true, nuki_code: null }).eq("id", b.id);
    revoked++;
  }
  return revoked;
}

// Belt-and-suspenders against accumulation toward Nuki's ~200-auth limit: sweep every "Fittin …"
// keypad auth whose validity window has passed and delete it, regardless of DB state (catches orphans
// from partial failures and bookings whose row was cleared). Only touches our own named, expired codes.
export async function reconcileKeypadCodes(admin) {
  let gyms = [];
  try {
    const { data } = await admin.from("gym_integrations").select("gym_id").eq("nuki_enabled", true);
    gyms = data || [];
  } catch {}
  let removed = 0;
  const now = Date.now();
  for (const g of gyms) {
    const cfg = await getNukiConfig(admin, g.gym_id);
    if (!cfg.enabled) continue;
    const list = await listAuths(cfg);
    for (const a of list) {
      if (!a?.name || !String(a.name).startsWith("Fittin ") || a?.id == null) continue;
      const until = a.allowedUntilDate ? new Date(a.allowedUntilDate).getTime() : null;
      if (until != null && until < now - 60000) {
        try { await deleteAuth(cfg, a.id); removed++; } catch {}
      }
    }
  }
  return removed;
}

// Remote unlatch — the in-app "open de deur" button (action 3 = unlatch/open).
export function openDoorViaNuki(cfg) {
  return nukiFetch(cfg, `/smartlock/${cfg.smartlockId}/action`, { method: "POST", body: { action: 3 } });
}

// Is the lock actually reachable by the Nuki cloud right now? When the Bridge/Wi-Fi drops, the Web API
// still lists cached auths and even accepts new ones, but they never sync to the physical keypad — so a
// freshly minted per-booking code silently doesn't work at the door. We detect that here: a non-OK
// serverState, or a "last seen" timestamp that's gone stale, means codes won't reach the keypad.
const LOCK_STALE_MIN = 90;
export async function getLockHealth(cfg) {
  if (!cfg?.hasToken || !cfg?.hasLock) return { checked: false, stale: false };
  try {
    const r = await nukiFetch(cfg, `/smartlock/${cfg.smartlockId}`);
    if (!r.ok) return { checked: true, reachable: false, stale: true, reason: `status ${r.status}` };
    const l = await r.json();
    const lastSeen = l?.state?.timestamp || l?.updateDate || null;
    const ageMin = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 60000 : Infinity;
    const stale = l?.serverState !== 0 || ageMin > LOCK_STALE_MIN;
    return { checked: true, reachable: true, stale, serverState: l?.serverState, lastSeen, ageMin: Math.round(ageMin) };
  } catch {
    return { checked: true, reachable: false, stale: true, reason: "unreachable" };
  }
}

// Settings test: confirm the token works and (optionally) that the smartlock id exists.
export async function testNuki(token, smartlockId) {
  try {
    const r = await fetch(`${NUKI_BASE}/smartlock`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401 || r.status === 403) return { error: "Token geweigerd (401/403). Controleer je Nuki Web API-token." };
    if (!r.ok) return { error: `Nuki antwoordde met status ${r.status}.` };
    const data = await r.json();
    const locks = Array.isArray(data) ? data : [];
    const match = locks.find((l) => String(l.smartlockId) === String(smartlockId));
    return {
      ok: true,
      count: locks.length,
      lockName: match?.name || null,
      lockFound: smartlockId ? !!match : null,
      locks: locks.map((l) => ({ id: String(l.smartlockId), name: l.name })),
    };
  } catch {
    return { error: "Kon Nuki niet bereiken." };
  }
}
