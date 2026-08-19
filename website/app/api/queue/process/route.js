import { NextResponse } from "next/server";
import { after } from "next/server";
import { processSendQueue } from "@/lib/newsletter";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = parseInt(process.env.NEWSLETTER_BATCH || "40", 10);     // emails per tick
const DELAY = parseInt(process.env.NEWSLETTER_TICK_MS || "4000", 10); // pace between ticks
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hartslag in cron_runs, zoals de drie andere geplande taken. Zonder deze rij is een stilgevallen
// wachtrij onzichtbaar — precies wat er bij de eerste nieuwsbrief gebeurde. Alleen de tik van de
// planner schrijft; de zelf-geketende tikken niet, want het weekrapport leest maar de laatste 30
// rijen en een verzendreeks zou de andere taken daar wegduwen.
async function heartbeat(ok, detail) {
  try {
    await createAdminClient().from("cron_runs").insert({ job: "queue", ok, detail });
  } catch {}
}

// Drains the newsletter send queue one batch at a time, then triggers the next tick after the
// response is sent (Next `after`) — a paced background chain, no external cron needed.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  // Mandatory auth — same secret as the cron. Never world-callable.
  if (!secret) return new NextResponse("queue not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("unauthorized", { status: 401 });
  const chained = new URL(req.url).searchParams.get("tick") === "1";

  let res;
  try {
    res = await processSendQueue(BATCH);
  } catch (e) {
    if (!chained) await heartbeat(false, { error: e?.message || String(e) });
    throw e;
  }
  // res.error = de batch ging de deur niet uit (Resend-fout); dat telt als een slechte run.
  if (!chained) await heartbeat(!res?.error, res);

  // More queued? Schedule the next tick (paced) after we respond, so the chain keeps draining.
  if (!res.done) {
    after(async () => {
      await sleep(DELAY);
      try {
        await fetch(`${SITE}/api/queue/process?tick=1`, { cache: "no-store", headers: { Authorization: `Bearer ${secret}` } });
      } catch {}
    });
  }
  return NextResponse.json(res);
}
