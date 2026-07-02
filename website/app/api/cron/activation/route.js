import { NextResponse } from "next/server";
import { after } from "next/server";
import { runAllActivations } from "@/lib/activation";
import { sendDueReminders, sendCreditExpiryWarnings, sendFirstSessionFollowups, sendGuestFollowups } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

// Daily activation sweep (Vercel Cron). Protected by CRON_SECRET when set — Vercel sends it as
// `Authorization: Bearer <CRON_SECRET>` automatically. Cooldown per campaign prevents repeats.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  // Mandatory auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without the secret
  // configured the endpoint stays closed (it must never be world-callable).
  if (!secret) return new NextResponse("cron not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  // These sweeps release blocked slots + send reminders — failures must be visible, not swallowed.
  try { await createAdminClient().rpc("expire_unpaid_bookings", { p_gym: null }); } catch (e) { console.error("cron expire_unpaid_bookings failed:", e?.message); }
  try { await createAdminClient().rpc("award_challenges"); } catch (e) { console.error("cron award_challenges failed:", e?.message); }
  let reminders = 0;
  try { reminders = await sendDueReminders(); } catch (e) { console.error("cron reminders failed:", e?.message); }
  try { await sendCreditExpiryWarnings(); } catch (e) { console.error("cron credit-expiry warnings failed:", e?.message); }
  // Lifecycle spine (Batch 2): first-session follow-up + guest→member funnel (both idempotent).
  let firstFollowups = 0, guestFollowups = 0;
  try { firstFollowups = await sendFirstSessionFollowups(); } catch (e) { console.error("cron first-session followups failed:", e?.message); }
  try { guestFollowups = await sendGuestFollowups(); } catch (e) { console.error("cron guest followups failed:", e?.message); }
  const results = await runAllActivations();
  const sent = results.reduce((a, r) => a + (r.sent || 0), 0);
  // Safety net: resume any newsletter queue that stalled (chain died) by kicking the worker.
  after(async () => {
    try { await fetch(`${SITE}/api/queue/process`, { cache: "no-store", headers: { Authorization: `Bearer ${secret}` } }); } catch {}
  });
  return NextResponse.json({ ran: results.length, sent, reminders, firstFollowups, guestFollowups, results });
}
