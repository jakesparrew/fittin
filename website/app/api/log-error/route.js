import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ok = () => new NextResponse(null, { status: 204 });
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

// First-party client-error sink. Best-effort, always 204. No external tracker.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = clip(body.message, 1000);
    if (!message) return ok();
    let userId = null;
    try { const { data: { user } } = await (await createClient()).auth.getUser(); userId = user?.id || null; } catch {}
    await createAdminClient().from("client_errors").insert({
      message,
      stack: clip(body.stack, 4000),
      path: clip(body.path, 300),
      ua: clip(req.headers.get("user-agent"), 300),
      user_id: userId,
    });
  } catch {}
  return ok();
}
