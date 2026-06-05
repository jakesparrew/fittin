import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth + email-confirmation landing. Exchanges the code for a session, then redirects.
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

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next.startsWith("/") ? next : "/account"}`);
    console.error("exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${base}/login?error=geen-code`);
}
