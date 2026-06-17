import { NextResponse } from "next/server";
import { after } from "next/server";
import { processSendQueue } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = parseInt(process.env.NEWSLETTER_BATCH || "40", 10);     // emails per tick
const DELAY = parseInt(process.env.NEWSLETTER_TICK_MS || "4000", 10); // pace between ticks
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Drains the newsletter send queue one batch at a time, then triggers the next tick after the
// response is sent (Next `after`) — a paced background chain, no external cron needed.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  // Mandatory auth — same secret as the cron. Never world-callable.
  if (!secret) return new NextResponse("queue not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });

  const res = await processSendQueue(BATCH);

  // More queued? Schedule the next tick (paced) after we respond, so the chain keeps draining.
  if (!res.done) {
    after(async () => {
      await sleep(DELAY);
      try {
        await fetch(`${SITE}/api/queue/process`, { cache: "no-store", headers: { Authorization: `Bearer ${secret}` } });
      } catch {}
    });
  }
  return NextResponse.json(res);
}
