import { NextResponse } from "next/server";
import { sendDueAccessCodes, sendSessionFeedbackRequests } from "@/lib/reminders";
import { revokeExpiredKeypadCodes, reconcileKeypadCodes } from "@/lib/nuki";
import { alertNewClientErrors } from "@/lib/error-alert";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Runs every few minutes (Vercel Cron, */5). E-mails each member their access code ~5 minutes
// before the session starts. Protected by CRON_SECRET — Vercel sends `Authorization: Bearer <CRON_SECRET>`.
// (Sub-daily cron frequency requires a Vercel plan that allows it.)
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("cron not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  // Door codes are time-critical — a silent failure here strands members at a locked door.
  // Log every failure and return non-200 so Vercel's cron monitoring can alert on it.
  const errors = [];
  let sent = 0, revoked = 0, swept = 0, feedback = 0;
  try {
    const r = await sendDueAccessCodes();
    sent = r?.sent ?? 0;
    // Door-code mint/config failures are door-critical → treat as cron errors so the run is flagged (500 + ok=false).
    if (r?.failures?.length) { errors.push(...r.failures); console.error("cron access code problems:", r.failures.join("; ")); }
  } catch (e) { errors.push(`access: ${e?.message}`); console.error("cron access codes failed:", e?.message); }
  // Clean up keypad codes for sessions that ended (+grace) or were cancelled, then sweep the lock for
  // any expired/orphan "Fittin …" codes as a backstop against accumulation.
  try { revoked = await revokeExpiredKeypadCodes(createAdminClient()); } catch (e) { errors.push(`revoke: ${e?.message}`); console.error("cron revoke failed:", e?.message); }
  try { swept = await reconcileKeypadCodes(createAdminClient()); } catch (e) { errors.push(`sweep: ${e?.message}`); console.error("cron sweep failed:", e?.message); }
  // Nieuwe app-fouten meteen melden (les van 5-6 aug: een fout in de boekflow stond een halve dag
  // onbekeken in de logs terwijl een betalend lid niet kon boeken). Best-effort: een kapot alarm
  // mag de deurcode-taak nooit meeslepen — de deur gaat vóór de telemetrie.
  try { await alertNewClientErrors(createAdminClient()); } catch (e) { console.error("cron error-alert failed:", e?.message); }
  // De sterrenvraag ~45 min na de sessie liftt mee op deze cron van elke 5 minuten. Best-effort en
  // bewust NIET in `errors`: een mislukte tevredenheidsvraag mag de deurcode-taak nooit rood
  // kleuren. De deur gaat voor.
  try { feedback = await sendSessionFeedbackRequests(); } catch (e) { console.error("cron feedbackvraag mislukt:", e?.message); }
  // Health heartbeat (Batch 6.5): one row per run so the cockpit shows this door-critical cron is alive.
  try { await createAdminClient().from("cron_runs").insert({ job: "access_codes", ok: errors.length === 0, detail: { sent, revoked, swept, feedback, ...(errors.length ? { errors } : {}) } }); } catch {}
  return NextResponse.json({ sent, revoked, swept, feedback, ...(errors.length ? { errors } : {}) }, { status: errors.length ? 500 : 200 });
}
