import { NextResponse } from "next/server";
import { runAllActivations } from "@/lib/activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily activation sweep (Vercel Cron). Protected by CRON_SECRET when set — Vercel sends it as
// `Authorization: Bearer <CRON_SECRET>` automatically. Cooldown per campaign prevents repeats.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || req.nextUrl.searchParams.get("key");
    if (auth !== `Bearer ${secret}` && auth !== secret) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }
  const results = await runAllActivations();
  const sent = results.reduce((a, r) => a + (r.sent || 0), 0);
  return NextResponse.json({ ran: results.length, sent, results });
}
