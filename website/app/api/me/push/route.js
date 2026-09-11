import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUSH_COOKIE } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The app registers its push token here on every launch/resume (lib/native/push.js).
// Upsert on (user_id, token): re-registering is what revives a token that was deactivated.
// The token is also set as an httpOnly cookie so /auth/signout can switch off THIS device.
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Ongeldig" }, { status: 400 }); }
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform === "android" ? "android" : body?.platform === "ios" ? "ios" : null;
  const environment = body?.environment === "development" ? "development" : "production";
  if (!token || token.length > 4096 || !platform) return NextResponse.json({ error: "Ongeldig" }, { status: 400 });

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("gym_id").eq("id", user.id).single();
  const { error } = await admin.from("push_tokens").upsert(
    { user_id: user.id, gym_id: prof?.gym_id, token, platform, environment, active: true, last_seen_at: new Date().toISOString() },
    { onConflict: "user_id,token" }
  );
  if (error) {
    // Table not migrated yet on this environment: the app must keep working without push.
    console.error("push token upsert failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PUSH_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return res;
}
