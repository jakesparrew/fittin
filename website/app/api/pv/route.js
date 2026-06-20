import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|bingpreview|headless|lighthouse|monitor|curl|wget|python-requests/i;
const ok = () => new NextResponse(null, { status: 204 });

// First-party page-view beacon. Stores a privacy-safe view: path, external referrer host, a daily
// anonymous visitor hash (no PII, no cookie), device class. Best-effort — always returns 204.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    let path = String(body.path || "");
    if (!path.startsWith("/")) return ok();
    path = path.split("?")[0].split("#")[0].slice(0, 300);
    // Ignore internals, assets and staff areas (we want real visitor traffic).
    if (path.startsWith("/api") || path.startsWith("/_next") || /\.[a-z0-9]{2,5}$/i.test(path)) return ok();
    if (path.startsWith("/beheer") || path.startsWith("/coach")) return ok();

    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT.test(ua)) return ok();

    // Daily anonymous fingerprint — sha256(ip|ua|day|secret), truncated. Rotates every day, no PII kept.
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0";
    const day = new Date().toISOString().slice(0, 10);
    const salt = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fittin";
    const visitor = crypto.createHash("sha256").update(`${ip}|${ua}|${day}|${salt}`).digest("hex").slice(0, 32);

    let referrer_host = null;
    if (body.ref) {
      try {
        const h = new URL(String(body.ref)).hostname;
        if (h && !h.endsWith("fittin.be") && !h.startsWith("localhost")) referrer_host = h.slice(0, 120);
      } catch {}
    }
    const device = /mobile|android|iphone|ipad|ipod/i.test(ua) ? "mobile" : "desktop";

    await createAdminClient().from("page_views").insert({ path, referrer_host, visitor, device });
  } catch {}
  return ok();
}
