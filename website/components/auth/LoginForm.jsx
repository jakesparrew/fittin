"use client";
import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authAction } from "@/app/(site)/login/actions";

export default function LoginForm() {
  const params = useSearchParams();
  const nextUrl = params.get("next") || "/account";
  const urlError = params.get("error");
  const refCode = params.get("ref") || "";
  const [mode, setMode] = useState(params.get("mode") === "signup" || refCode ? "signup" : "login"); // 'login' | 'signup'
  const [state, formAction, pending] = useActionState(authAction, {});
  const [googleErr, setGoogleErr] = useState("");

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

  async function handleGoogle() {
    setGoogleErr("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextUrl)}` },
      });
      if (error) setGoogleErr(error.message);
    } catch (e) {
      setGoogleErr("Google login is even niet beschikbaar.");
    }
  }

  return (
    <main className="bg-paper">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-16">
        <div className="rounded-3xl border border-borderc bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">
            {mode === "login" ? "Welkom terug" : "Word lid"}
          </p>
          <h1 className="mt-2 text-3xl font-black">{mode === "login" ? "Inloggen" : "Account aanmaken"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-brand/60">
            {mode === "login"
              ? "Log in om de gym te reserveren en je boekingen te beheren."
              : "Registreren is gratis. Je eerste uur is gratis met de code FittinWelcome."}
          </p>

          {urlError && (
            <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
              Inloggen mislukt: {urlError === "auth" ? "probeer opnieuw." : urlError}
            </div>
          )}

          {!isSupabaseConfigured && (
            <div className="mt-5 rounded-2xl bg-accent/10 p-4 text-xs leading-relaxed text-accentdark">
              Supabase is nog niet gekoppeld. Vul de sleutels in <code>.env.local</code> in.
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
          {googleErr && <p className="mt-2 text-sm font-semibold text-red-600">{googleErr}</p>}

          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-lav">
            <span className="h-px flex-1 bg-borderc" /> of <span className="h-px flex-1 bg-borderc" />
          </div>

          {refCode && mode === "signup" && (
            <div className="mt-4 rounded-2xl bg-accent/10 p-3 text-sm font-semibold text-accentdark">
              Je bent uitgenodigd met vriendcode <span className="font-black">{refCode}</span> — jullie krijgen allebei een gratis sessie.
            </div>
          )}

          <form action={formAction} className="space-y-3">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="next" value={nextUrl} />
            <input type="hidden" name="ref" value={refCode} />
            {mode === "signup" && <Field label="Naam" name="name" type="text" autoComplete="name" required />}
            <Field label="E-mail" name="email" type="email" autoComplete="email" required />
            <PasswordField autoComplete={mode === "signup" ? "new-password" : "current-password"} />

            {mode === "login" && (
              <div className="text-right">
                <Link href="/wachtwoord-vergeten" className="text-xs font-semibold text-accentdark hover:underline">
                  Wachtwoord vergeten?
                </Link>
              </div>
            )}

            {state?.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
            {state?.info && <p className="text-sm font-semibold text-accentdark">{state.info}</p>}

            <button
              type="submit"
              disabled={pending || !isSupabaseConfigured}
              className="w-full rounded-full bg-accent py-3.5 font-bold text-brand transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Even geduld…" : mode === "login" ? "Inloggen" : "Account aanmaken"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-brand/60">
            {mode === "login" ? "Nog geen account?" : "Al een account?"}{" "}
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
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

function Field({ label, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-brand">{label}</span>
      <input
        {...rest}
        className="w-full rounded-2xl border-2 border-borderc bg-white px-4 py-3 text-brand outline-none transition focus:border-accent"
      />
    </label>
  );
}

function PasswordField({ autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-brand">Wachtwoord</span>
      <div className="relative">
        <input
          name="password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className="w-full rounded-2xl border-2 border-borderc bg-white px-4 py-3 pr-12 text-brand outline-none transition focus:border-accent"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Verberg wachtwoord" : "Toon wachtwoord"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand/40 transition hover:text-brand"
        >
          {show ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.45 18.45 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
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
