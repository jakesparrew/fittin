import { NextResponse } from "next/server";
import { after } from "next/server";
import { runAllActivations } from "@/lib/activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

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
  // Safety net: resume any newsletter queue that stalled (chain died) by kicking the worker.
  after(async () => {
    try { await fetch(`${SITE}/api/queue/process${secret ? `?key=${encodeURIComponent(secret)}` : ""}`, { cache: "no-store" }); } catch {}
  });
  return NextResponse.json({ ran: results.length, sent, results });
}
