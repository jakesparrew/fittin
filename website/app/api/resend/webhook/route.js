import { NextResponse } from "next/server";
import crypto from "crypto";
import { recordResendEvent } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend reachability check on endpoint creation.
export async function GET() {
  return NextResponse.json({ ok: true });
}

// Verify the Svix signature Resend sends. No-op if RESEND_WEBHOOK_SECRET isn't set.
function verifySignature(headers, rawBody) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // Fail closed: an unsigned request is rejected unless the secret is configured.
  if (!secret) { console.warn("RESEND_WEBHOOK_SECRET not set — rejecting webhook"); return false; }
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  try {
    const key = Buffer.from(secret.replace("whsec_", ""), "base64");
    const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
    return sigHeader.split(" ").some((part) => {
      const sig = part.split(",")[1];
      if (!sig) return false;
      try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
    });
  } catch {
    return false;
  }
}

// Resend delivery/open/click/bounce events → update campaign_sends + campaign stats.
export async function POST(req) {
  const rawBody = await req.text();
  if (!verifySignature(req.headers, rawBody)) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }
  try {
    await recordResendEvent(event?.type, event?.data?.email_id);
  } catch (e) {
    console.error("resend webhook:", event?.type, e?.message);
  }
  return NextResponse.json({ received: true });
}
