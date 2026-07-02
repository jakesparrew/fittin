"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/auth";
import { enrollUserInDrips } from "@/lib/newsletter";

// Only allow same-site relative redirects (block open-redirect: //evil.com, https://evil.com, \\evil).
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : null);

// Resolve where to send the user after auth: an explicit safe non-default `next`, else role home.
async function destination(supabase, userId, next) {
  const clean = safeNext(next);
  if (clean && clean !== "/account") return clean;
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return roleHome(prof?.role);
}

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
    if (error) {
      const m = error.message || "";
      return { error:
        /already registered|already exists|already been registered/i.test(m) ? "Er bestaat al een account met dit e-mailadres. Log in of reset je wachtwoord."
        : /weak|at least|should be|password/i.test(m) ? "Kies een sterker wachtwoord (minstens 6 tekens)."
        : /rate|too many|seconds/i.test(m) ? "Te veel pogingen. Wacht even en probeer opnieuw."
        : "Registreren mislukt. Probeer het opnieuw." };
    }
    await enrollUserInDrips(data.user.id); // start any active welcome drip
    const ref = String(formData.get("ref") || "").trim();
    if (ref) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      await createAdminClient().from("profiles").update({ pending_referral: ref }).eq("id", data.user.id);
    }
    if (!data.session) return { info: "Bevestig je e-mail via de link die we je net stuurden, en log dan in." };
    // Auto-confirmed signup (no e-mail confirmation step) → send the Day-0 welcome here, since this
    // user won't pass through /auth/callback. Confirmation-required signups get it there instead.
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { sendWelcomeMember } = await import("@/lib/email");
      const admin = createAdminClient();
      const r = await sendWelcomeMember({ to: email, name: fullName });
      if (r?.ok !== false) await admin.from("profiles").update({ day0_welcome_sent: true }).eq("id", data.user.id);
    } catch (e) { console.error("day0 welcome (signup) failed:", e?.message); }
    redirect(await destination(supabase, data.user.id, next));
  }

  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Inloggen mislukt. Controleer je e-mail en wachtwoord." };
  redirect(await destination(supabase, signIn.user.id, next));
}
