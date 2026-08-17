import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|bingpreview|headless|lighthouse|monitor|curl|wget|python-requests/i;
const ok = () => new NextResponse(null, { status: 204 });

// Een pad hoort bij een staff-zone als het exact die route is of eronder zit. startsWith("/coach")
// alleen zou ook /coaches en /coaches/<naam> wegfilteren — precies de twee publieke PT-verkoop-
// pagina's — waardoor het lijkt alsof niemand ze bezoekt.
const staffPath = (p) => p === "/beheer" || p.startsWith("/beheer/") || p === "/coach" || p.startsWith("/coach/");

// Ruwe IP-limiet: één bezoeker kan de beacon niet als schrijfkanaal misbruiken. Bewust in het
// geheugen van de instantie (geen extra tabel, geen DB-rondje per beacon) — bij serverless draaien
// er meerdere instanties, dus dit is een plafond per instantie en géén waterdichte beveiliging.
// Het echte slot blijft de whitelist + de vaste kolomvorm hieronder.
const HITS = new Map(); // ip -> { n, resetAt }
const LIMIT = 120, WINDOW = 60000; // ~2 weergaves per seconde per IP; een mens haalt dat nooit
function overLimit(ip) {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || now > cur.resetAt) {
    if (HITS.size > 5000) HITS.clear(); // vangnet tegen geheugengroei bij een botnet
    HITS.set(ip, { n: 1, resetAt: now + WINDOW });
    return false;
  }
  cur.n++;
  return cur.n > LIMIT;
}

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
    if (staffPath(path)) return ok();

    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT.test(ua)) return ok();

    // Named funnel event (optional) — whitelisted so the beacon can't be abused as arbitrary storage.
    // Wie hier niet in staat wordt stil weggegooid: elk nieuw event moet dus in deze lijst bijkomen,
    // anders meet de trechter niets terwijl de knop wél afvuurt.
    const EVENTS = new Set([
      "home_cta_click",       // klik op een hero-/CTA-knop op de homepage (top van de trechter)
      "booking_slot_chosen",  // moment gekozen in /boeken
      "checkout_started",     // poging tot betalen
      "booking_completed",    // boeking effectief bevestigd — de noemer onder checkout_started
      "signup_completed",     // account aangemaakt (de grootste uitvalstap)
      "intake_requested",     // PT-intake aangevraagd — het hoofddoel van de PT-tak
      "install_prompt_shown", "install_accepted", "referral_link_shared", "waitlist_joined",
    ]);
    const event = EVENTS.has(String(body.event || "")) ? String(body.event) : null;
    // UTM attribution (campaign labels, not PII) — truncated + lowercased.
    const utm = (v) => { const s = String(v || "").trim().toLowerCase().slice(0, 80); return s || null; };
    const utm_source = utm(body.utm_source), utm_medium = utm(body.utm_medium), utm_campaign = utm(body.utm_campaign);

    // Daily anonymous fingerprint — sha256(ip|ua|day|secret), truncated. Rotates every day, no PII kept.
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0";
    if (overLimit(ip)) return ok();
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

    await createAdminClient().from("page_views").insert({ path, referrer_host, visitor, device, event, utm_source, utm_medium, utm_campaign });
  } catch {}
  return ok();
}
