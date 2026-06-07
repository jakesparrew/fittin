import { NextResponse } from "next/server";
import { roleHome } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reliable auth state for the client nav (avoids the flaky browser GoTrue client). Because this
// runs in a route handler, a refreshed token is written back to cookies → keeps the session alive.
//
// Perf: one getUser() round-trip, then profile + unread-count run in PARALLEL (was sequential),
// and the rare referral redeem is fire-and-forget so it never delays the nav response. Combined
// with the fra1 function region (colocated with the eu-central-1 Supabase), this keeps the nav's
// per-page auth call snappy.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ loggedIn: false }, { headers: { "Cache-Control": "no-store" } });

  // Supabase queries resolve to { data, count, error } and never throw, so a missing table or
  // RLS denial degrades to null (→ unread 0) rather than rejecting the Promise.all.
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("full_name, role, pending_referral").eq("id", user.id).single(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false),
  ]);

  // Auto-redeem a referral code carried over from a buddy-invite signup (best-effort, once).
  // Fire-and-forget — the redeem + clear must not block the nav from rendering.
  if (profile?.pending_referral) {
    createClient()
      .then((c) => c.rpc("redeem_referral", { p_code: profile.pending_referral }))
      .catch(() => {});
    createAdminClient().from("profiles").update({ pending_referral: null }).eq("id", user.id).then(
      () => {},
      () => {}
    );
  }

  return NextResponse.json(
    {
      loggedIn: true,
      name: profile?.full_name || user.email || "Account",
      role: profile?.role || "lid",
      home: roleHome(profile?.role),
      unread: count || 0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
