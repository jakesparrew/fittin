import { NextResponse } from "next/server";
import { recordResendEvent } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend reachability check on endpoint creation.
export async function GET() {
  return NextResponse.json({ ok: true });
}

// Resend delivery/open/click/bounce events → update campaign_sends + campaign stats.
// Events only ever update an existing send matched by Resend's email_id, so an unsigned
// event can't fabricate data (optional Svix verification can be layered on later).
export async function POST(req) {
  let event;
  try {
    event = await req.json();
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }
  const type = event?.type;
  const emailId = event?.data?.email_id;
  try {
    await recordResendEvent(type, emailId);
  } catch (e) {
    console.error("resend webhook:", type, e?.message);
  }
  return NextResponse.json({ received: true });
}
