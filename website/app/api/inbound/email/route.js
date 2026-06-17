import { NextResponse } from "next/server";
import crypto from "crypto";
import { importReceived } from "@/lib/inbox";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

// Svix signature check (no-op until RESEND_INBOUND_SECRET is set). NOTE: each Resend webhook
// endpoint has its OWN signing secret — the inbound endpoint's secret differs from the stats one,
// so we never fall back to RESEND_WEBHOOK_SECRET (a wrong secret would reject real inbound mail).
function verify(headers, raw) {
  const secret = process.env.RESEND_INBOUND_SECRET;
  // Fail closed: reject unsigned inbound mail unless the secret is configured.
  if (!secret) { console.warn("RESEND_INBOUND_SECRET not set — rejecting inbound webhook"); return false; }
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sh = headers.get("svix-signature");
  if (!id || !ts || !sh) return false;
  try {
    const key = Buffer.from(secret.replace("whsec_", ""), "base64");
    const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
    return sh.split(" ").some((p) => { const s = p.split(",")[1]; try { return s && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)); } catch { return false; } });
  } catch { return false; }
}

// Resend Inbound: an `email.received` event fires with data.email_id. We fetch the full message
// from Resend by id (authoritative) and store it if it's for an @fittin.be address.
export async function POST(req) {
  const raw = await req.text();
  if (!verify(req.headers, raw)) return new NextResponse("invalid signature", { status: 401 });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }
  if (event?.type === "email.received" && event?.data?.email_id) {
    try {
      const admin = createAdminClient();
      const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
      if (gym) await importReceived(gym.id, event.data.email_id);
    } catch (e) {
      console.error("inbound webhook:", e?.message);
    }
  }
  return NextResponse.json({ received: true });
}
