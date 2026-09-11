import http2 from "node:http2";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Native push: APNs directly (iOS) and FCM HTTP v1 (Android). No SDK, no extra dependency — two
// signed JWTs and two HTTPS calls.
//
// Silently OFF until the keys exist (NATIVE-OWNER-TODO.md):
//   APNS_KEY_P8 (file contents), APNS_KEY_ID, APPLE_TEAM_ID       → iOS
//   FCM_SERVICE_ACCOUNT_JSON                                      → Android
//
// Called from lib/notify.js, so every in-app bell notification also pushes, with the same `link`.
// Hard lessons baked in (playbook §15):
//   - BadDeviceToken is environment-ambiguous (a sandbox token sent to production or the reverse):
//     retry the other APNs host before giving up on a token.
//   - Only Unregistered / HTTP 410 (APNs) and UNREGISTERED (FCM) deactivate a token.
//   - Tokens are re-sent by the app on every launch and resume; the upsert revives them.

export const PUSH_COOKIE = "fittin_push";
const BUNDLE_ID = "be.fittin.app";

const apnsConfigured = () => !!(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID && process.env.APPLE_TEAM_ID);
const fcmConfigured = () => !!process.env.FCM_SERVICE_ACCOUNT_JSON;
export const pushConfigured = () => apnsConfigured() || fcmConfigured();

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// ---------- APNs ----------
let apnsJwt = { token: null, at: 0 };
function apnsToken() {
  // Apple wants a fresh token at most every 60 min and rejects one refreshed more than every 20.
  if (apnsJwt.token && Date.now() - apnsJwt.at < 50 * 60 * 1000) return apnsJwt.token;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const iat = Math.floor(Date.now() / 1000);
  const claims = b64url(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat }));
  const key = process.env.APNS_KEY_P8.replace(/\\n/g, "\n");
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  apnsJwt = { token: `${header}.${claims}.${b64url(sig)}`, at: Date.now() };
  return apnsJwt.token;
}

function apnsSend(deviceToken, environment, payload) {
  const host = environment === "development" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  return new Promise((resolve) => {
    let client;
    try { client = http2.connect(host); } catch (e) { resolve({ status: 0, reason: e.message }); return; }
    client.on("error", (e) => resolve({ status: 0, reason: e.message }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setTimeout(8000, () => { req.close(); });
    req.on("response", (h) => { status = h[":status"]; });
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      client.close();
      let reason = "";
      try { reason = JSON.parse(body || "{}").reason || ""; } catch { /* empty body on 200 */ }
      resolve({ status, reason });
    });
    req.on("error", (e) => { client.close(); resolve({ status: 0, reason: e.message }); });
    req.end(JSON.stringify(payload));
  });
}

async function sendIos(row, { title, body, link }) {
  const payload = { aps: { alert: { title, body: body || undefined }, sound: "default" }, link: link || "/notificaties" };
  let r = await apnsSend(row.token, row.environment, payload);
  let env = row.environment;
  if (r.status === 400 && r.reason === "BadDeviceToken") {
    env = row.environment === "development" ? "production" : "development";
    r = await apnsSend(row.token, env, payload);
  }
  const dead = r.status === 410 || r.reason === "Unregistered" || (r.status === 400 && r.reason === "BadDeviceToken");
  return { ok: r.status === 200, dead, environment: env !== row.environment && r.status === 200 ? env : null };
}

// ---------- FCM ----------
let fcmAccess = { token: null, exp: 0 };
async function fcmAccessToken(sa) {
  if (fcmAccess.token && Date.now() < fcmAccess.exp - 60000) return fcmAccess.token;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }));
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), sa.private_key);
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("FCM token: " + (j.error_description || j.error || res.status));
  fcmAccess = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return fcmAccess.token;
}

async function sendAndroid(row, { title, body, link }) {
  const sa = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: row.token,
        notification: { title, body: body || undefined },
        data: { link: link || "/notificaties" },
        android: { priority: "high", notification: { channel_id: "fittin", icon: "ic_stat_notify", color: "#5FDA6B" } },
      },
    }),
  });
  if (res.ok) return { ok: true, dead: false };
  const j = await res.json().catch(() => ({}));
  const code = j?.error?.details?.find?.((d) => d.errorCode)?.errorCode || j?.error?.status;
  return { ok: false, dead: code === "UNREGISTERED" || res.status === 404 };
}

// ---------- Public ----------

/** Push to every active device of these users. Never throws: a push must never break an action. */
export async function pushToUsers(userIds, { title, body = null, link = null }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length || !title || !pushConfigured()) return;
  try {
    const db = createAdminClient();
    const { data: rows } = await db.from("push_tokens").select("id, token, platform, environment").in("user_id", ids).eq("active", true);
    if (!rows?.length) return;
    await Promise.all(rows.map(async (row) => {
      try {
        if (row.platform === "ios" && !apnsConfigured()) return;
        if (row.platform === "android" && !fcmConfigured()) return;
        const r = row.platform === "ios" ? await sendIos(row, { title, body, link }) : await sendAndroid(row, { title, body, link });
        if (r.dead) await db.from("push_tokens").update({ active: false }).eq("id", row.id);
        else if (r.environment) await db.from("push_tokens").update({ environment: r.environment }).eq("id", row.id);
      } catch (e) {
        console.error("push failed:", e?.message);
      }
    }));
  } catch (e) {
    console.error("push batch failed:", e?.message);
  }
}
