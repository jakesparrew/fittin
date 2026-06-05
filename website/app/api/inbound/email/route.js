import { NextResponse } from "next/server";
import crypto from "crypto";
import { importReceived } from "@/lib/inbox";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

// Svix signature check (no-op until RESEND_INBOUND_SECRET / RESEND_WEBHOOK_SECRET is set).
function verify(headers, raw) {
  const secret = process.env.RESEND_INBOUND_SECRET || process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true;
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
