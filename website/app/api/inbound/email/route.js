import { NextResponse } from "next/server";
import { importReceived } from "@/lib/inbox";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

// Resend Inbound: an `email.received` event fires with data.email_id. We fetch the full message
// from Resend by id (authoritative) and store it if it's for an @fittin.be address.
export async function POST(req) {
  let event;
  try {
    event = await req.json();
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
