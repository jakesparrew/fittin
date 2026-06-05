import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Live send progress for a campaign (staff only). Polled by the admin progress bar.
export async function GET(req) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const { profile } = await getSessionProfile();
  if (!profile || !["coach", "beheerder"].includes(profile.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data: c } = await supabase.from("campaigns").select("status, total, sent, delivered, opened, clicked, bounced").eq("id", id).single();
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { count: failed } = await supabase.from("campaign_sends").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "failed");
  return NextResponse.json({ ...c, failed: failed || 0 }, { headers: { "Cache-Control": "no-store" } });
}
