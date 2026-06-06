import { NextResponse } from "next/server";
import { awinLink } from "@/lib/affiliate";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Outbound affiliate redirect: logs the click (our analytics), then forwards via the Awin
// tracking link. Only allows Body & Fit destinations (no open redirect).
const ALLOWED = /^https:\/\/(www\.)?(bodyandfit\.com|bodyenfitshop\.(nl|be))\//i;

export async function GET(req) {
  const url = new URL(req.url);
  let to = url.searchParams.get("to") || "https://www.bodyandfit.com/nl-be/";
  const product = url.searchParams.get("p") || null;
  if (!ALLOWED.test(to)) to = "https://www.bodyandfit.com/nl-be/";
  try { await createAdminClient().from("affiliate_clicks").insert({ merchant: "bodyfit", product, dest: to }); } catch {}
  return NextResponse.redirect(awinLink(to), { status: 302 });
}
