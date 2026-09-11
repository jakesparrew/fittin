import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleHome } from "@/lib/auth";
import { enrollUserInDrips } from "@/lib/newsletter";
import { sendWelcomeMember } from "@/lib/email";

// OAuth + email-confirmation landing. Exchanges the code for a session, then redirects.
//
// `?native=1` without a code: the app signed in natively (Sign in with Apple → signInWithIdToken,
// see lib/native/auth.js) and the session cookie is already set. It comes through here anyway so
// every sign-in route gets the same welcome mail, drip enrolment and role home.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const base = process.env.NEXT_PUBLIC_SITE_URL || origin;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";
  const oauthError = searchParams.get("error_description") || searchParams.get("error");

  if (oauthError) {
    console.error("oauth callback error:", oauthError);
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(oauthError)}`);
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("exchangeCodeForSession failed:", error.message);
      return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
    }
    return NextResponse.redirect(`${base}${await naAanmelding(supabase, next)}`);
  }

  if (searchParams.get("native") === "1") {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return NextResponse.redirect(`${base}${await naAanmelding(supabase, next)}`);
    return NextResponse.redirect(`${base}/login?error=auth`);
  }

  return NextResponse.redirect(`${base}/login?error=geen-code`);
}

// Shared by every sign-in route: where to land, and the first-time welcome.
async function naAanmelding(supabase, next) {
  let dest = next.startsWith("/") ? next : "/account";
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return dest;
  const { data: prof } = await supabase.from("profiles").select("role, created_at, day0_welcome_sent").eq("id", user.id).single();
  if (dest === "/account") dest = roleHome(prof?.role);
  // Just-created account (e.g. first Google sign-in) → kick off any welcome drip.
  if (prof?.created_at && Date.now() - new Date(prof.created_at).getTime() < 60000) {
    await enrollUserInDrips(user.id);
    // Markeer de bestemming zodat de browser signup_completed kan afvuren. Meten moet daar
    // gebeuren: /api/pv leidt de bezoeker-hash af uit IP + user-agent, en dat is hier nog
    // exact dezelfde bezoeker als degene die op de advertentie klikte. Zonder dit telde de
    // hele Google-route niet mee (6 events in 90 dagen tegenover 18 leden per maand).
    dest += (dest.includes("?") ? "&" : "?") + "nieuw=1";
  }
  // Day-0 branded welcome for members who confirmed their own signup (email or Google). Admin-
  // created accounts get sendWelcomeNewAccount instead and are pre-marked, so they skip this.
  if (prof?.role === "lid" && prof?.day0_welcome_sent === false && user.email) {
    const admin = createAdminClient();
    try {
      const r = await sendWelcomeMember({ to: user.email, name: user.user_metadata?.full_name });
      if (r?.ok !== false) await admin.from("profiles").update({ day0_welcome_sent: true }).eq("id", user.id);
    } catch (e) { console.error("day0 welcome failed:", e?.message); }
  }
  return dest;
}
