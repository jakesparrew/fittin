import { NextResponse } from "next/server";
import { after } from "next/server";
import { runAllActivations } from "@/lib/activation";
import { sendDueReminders } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

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
  try { await createAdminClient().rpc("expire_unpaid_bookings", { p_gym: null }); } catch {}
  try { await createAdminClient().rpc("award_challenges"); } catch {}
  let reminders = 0;
  try { reminders = await sendDueReminders(); } catch {}
  const results = await runAllActivations();
  const sent = results.reduce((a, r) => a + (r.sent || 0), 0);
  // Safety net: resume any newsletter queue that stalled (chain died) by kicking the worker.
  after(async () => {
    try { await fetch(`${SITE}/api/queue/process`, { cache: "no-store", headers: { Authorization: `Bearer ${secret}` } }); } catch {}
  });
  return NextResponse.json({ ran: results.length, sent, results });
}
