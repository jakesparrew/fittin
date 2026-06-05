"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next") || "/account";

  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") ? "Inloggen mislukt, probeer opnieuw." : "");
  const [info, setInfo] = useState("");

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  async function handleGoogle() {
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextUrl)}` },
    });
    if (error) setError(error.message);
  }

  async function handleEmail(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.push(nextUrl);
          router.refresh();
        } else {
          setInfo("Bevestig je e-mail via de link die we je net stuurden, en log dan in.");
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(nextUrl);
        router.refresh();
      }
    } catch (err) {
      setError(err?.message || "Er ging iets mis.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bg-paper">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-16">
        <div className="rounded-3xl border border-borderc bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">
            {mode === "login" ? "Welkom terug" : "Word lid"}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {mode === "login" ? "Inloggen" : "Account aanmaken"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-brand/60">
            {mode === "login"
              ? "Log in om de gym te reserveren en je boekingen te beheren."
              : "Registreren is gratis. Je eerste uur is gratis met de code FittinWelcome."}
          </p>

          {!isSupabaseConfigured && (
            <div className="mt-5 rounded-2xl bg-accent/10 p-4 text-xs leading-relaxed text-accentdark">
              Supabase is nog niet gekoppeld. Vul de sleutels in <code>.env.local</code> in en
              herstart de dev-server om in te loggen.
            </div>
          )}

          <button
            onClick={handleGoogle}
            disabled={!isSupabaseConfigured}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border-2 border-borderc bg-white py-3 font-bold text-brand transition hover:border-lav disabled:opacity-40"
          >
            <GoogleIcon />
            Verder met Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-lav">
            <span className="h-px flex-1 bg-borderc" /> of <span className="h-px flex-1 bg-borderc" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <Field label="Naam" value={name} onChange={setName} type="text" autoComplete="name" required />
            )}
            <Field label="E-mail" value={email} onChange={setEmail} type="email" autoComplete="email" required />
            <Field
              label="Wachtwoord"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
            />

            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            {info && <p className="text-sm font-semibold text-accentdark">{info}</p>}

            <button
              type="submit"
              disabled={busy || !isSupabaseConfigured}
              className="w-full rounded-full bg-accent py-3.5 font-bold text-brand transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Even geduld…" : mode === "login" ? "Inloggen" : "Account aanmaken"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-brand/60">
            {mode === "login" ? "Nog geen account?" : "Al een account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setInfo("");
              }}
              className="font-bold text-accentdark hover:underline"
            >
              {mode === "login" ? "Word lid" : "Inloggen"}
            </button>
          </p>
        </div>

        <Link href="/" className="mt-6 text-center text-sm font-semibold text-brand/50 hover:text-brand">
          ← Terug naar de site
        </Link>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-brand">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border-2 border-borderc bg-white px-4 py-3 text-brand outline-none transition focus:border-accent"
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
