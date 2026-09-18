import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { draaiPuntenmotor } from "@/lib/punten-motor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Fittin' Punten (0165): elk uur sessies, weken, badges, groei en de feed bijwerken; 's nachts de rustige uren.
// Idempotent — een uur overslaan of twee keer draaien levert hetzelfde puntenboek op.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("cron not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  let res = [], ok = true;
  try {
    res = await draaiPuntenmotor(admin);
    ok = res.every((r) => !r.fout);
  } catch (e) {
    ok = false;
    console.error("cron punten failed:", e?.message);
    res = [{ fout: e?.message }];
  }
  try { await admin.from("cron_runs").insert({ job: "punten", ok, detail: { gyms: res } }); } catch {}
  return NextResponse.json({ ok, gyms: res });
}
