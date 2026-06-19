import { NextResponse } from "next/server";
import { sendDueAccessCodes } from "@/lib/reminders";

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
  let sent = 0;
  try { sent = await sendDueAccessCodes(); } catch {}
  return NextResponse.json({ sent });
}
