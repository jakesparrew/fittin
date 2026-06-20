import { NextResponse } from "next/server";
import { sendDueAccessCodes } from "@/lib/reminders";
import { revokeExpiredKeypadCodes, reconcileKeypadCodes } from "@/lib/nuki";
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
  let sent = 0, revoked = 0, swept = 0;
  try { sent = await sendDueAccessCodes(); } catch {}
  // Clean up keypad codes for sessions that ended (+grace) or were cancelled, then sweep the lock for
  // any expired/orphan "Fittin …" codes as a backstop against accumulation.
  try { revoked = await revokeExpiredKeypadCodes(createAdminClient()); } catch {}
  try { swept = await reconcileKeypadCodes(createAdminClient()); } catch {}
  return NextResponse.json({ sent, revoked, swept });
}
