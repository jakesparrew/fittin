"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/wachtwoord-herstellen`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="bg-paper">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-16">
        <div className="rounded-3xl border border-borderc bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Wachtwoord vergeten</p>
          <h1 className="mt-2 text-3xl font-black">Reset je wachtwoord</h1>
          {sent ? (
            <p className="mt-4 rounded-2xl bg-accent/15 p-4 text-sm font-semibold text-accentdark">
              Check je inbox — we stuurden een link om je wachtwoord opnieuw in te stellen.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-3">
              <p className="text-sm text-brand/60">Vul je e-mail in en we sturen je een herstellink.</p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jouw@email.be"
                className="w-full rounded-2xl border-2 border-borderc bg-white px-4 py-3 text-brand outline-none transition focus:border-accent"
              />
              {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
              <button disabled={busy} className="w-full rounded-full bg-accent py-3.5 font-bold text-brand transition hover:opacity-90 disabled:opacity-40">
                {busy ? "Versturen…" : "Stuur herstellink"}
              </button>
            </form>
          )}
          <Link href="/login" className="mt-5 block text-center text-sm font-semibold text-brand/50 hover:text-brand">
            ← Terug naar inloggen
          </Link>
        </div>
      </div>
    </main>
  );
}
