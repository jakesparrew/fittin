"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Lets a member connect Google to their existing email/password account (or vice-versa)
// so there are no duplicate accounts. Uses Supabase manual identity linking.
export default function AccountLinking({ providers = [] }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const hasGoogle = providers.includes("google");
  const hasEmail = providers.includes("email");
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

  async function linkGoogle() {
    setErr("");
    setBusy(true);
    try {
      const sb = createClient();
      const { error } = await sb.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${siteUrl}/auth/callback?next=/account` },
      });
      if (error) {
        setErr(error.message);
        setBusy(false);
      }
      // success → browser redirects to Google
    } catch (e) {
      setErr("Koppelen lukt even niet, probeer opnieuw.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-12 rounded-3xl border border-borderc bg-white p-6">
      <h2 className="font-black text-brand">Inlogmethodes</h2>
      <p className="mt-1 text-sm text-brand/60">Koppel meerdere manieren om in te loggen — zonder dubbel account.</p>
      <div className="mt-4 space-y-2">
        <Row label="E-mail & wachtwoord" active={hasEmail} />
        <Row
          label="Google"
          active={hasGoogle}
          action={
            !hasGoogle && (
              <button onClick={linkGoogle} disabled={busy} className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-brand transition hover:opacity-90 disabled:opacity-50">
                {busy ? "Bezig…" : "Koppel Google"}
              </button>
            )
          }
        />
      </div>
      {err && <p className="mt-3 text-sm font-semibold text-red-600">{err}</p>}
    </section>
  );
}

function Row({ label, active, action }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-paper px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-bold text-brand">
        <span className={active ? "text-accentdark" : "text-brand/30"}>{active ? "●" : "○"}</span>
        {label}
      </span>
      {active ? <span className="text-xs font-bold text-accentdark">Verbonden</span> : action || <span className="text-xs text-brand/40">Niet verbonden</span>}
    </div>
  );
}
