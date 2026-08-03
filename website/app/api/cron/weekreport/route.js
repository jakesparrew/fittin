import { NextResponse } from "next/server";
import { sendWeekReports } from "@/lib/weekreport";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Wekelijks rapport naar de beheerders (Vercel Cron, maandagochtend). Zelfde afscherming als de
// andere crons: zonder CRON_SECRET blijft het endpoint dicht, want het leest bedrijfscijfers.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("cron not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  let res = { sent: 0, skipped: 0 }, ok = true;
  try {
    res = await sendWeekReports();
  } catch (e) {
    ok = false;
    console.error("cron weekreport failed:", e?.message);
  }
  try { await createAdminClient().from("cron_runs").insert({ job: "weekreport", ok, detail: res }); } catch {}
  return NextResponse.json({ ok, ...res });
}
