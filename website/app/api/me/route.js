import { NextResponse } from "next/server";
import { getSessionProfile, roleHome } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reliable auth state for the client nav (avoids the flaky browser GoTrue client). Because this
// runs in a route handler, a refreshed token is written back to cookies → keeps the session alive.
export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ loggedIn: false }, { headers: { "Cache-Control": "no-store" } });

  // Auto-redeem a referral code carried over from a buddy-invite signup (best-effort, once).
  if (profile?.pending_referral) {
    try {
      const supabase = await createClient();
      await supabase.rpc("redeem_referral", { p_code: profile.pending_referral });
    } catch {}
    await createAdminClient().from("profiles").update({ pending_referral: null }).eq("id", user.id);
  }
  return NextResponse.json(
    {
      loggedIn: true,
      name: profile?.full_name || user.email || "Account",
      role: profile?.role || "lid",
      home: roleHome(profile?.role),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
