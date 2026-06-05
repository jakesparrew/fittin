"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Email login/signup via a SERVER action (server-side Supabase client). This is the robust,
// official @supabase/ssr pattern — it sets the auth cookie server-side and never touches the
// browser GoTrue client, so it can't hang.
export async function authAction(_prevState, formData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/account");
  const mode = formData.get("mode");

  if (!email || !password) return { error: "Vul je e-mail en wachtwoord in." };

  if (mode === "signup") {
    const fullName = String(formData.get("name") || "").trim();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return { error: error.message };
    if (!data.session) return { info: "Bevestig je e-mail via de link die we je net stuurden, en log dan in." };
    redirect(next);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Inloggen mislukt. Controleer je e-mail en wachtwoord." };
  redirect(next);
}
