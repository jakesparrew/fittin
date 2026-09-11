"use client";
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authAction } from "@/app/(site)/login/actions";
import { track } from "@/lib/track";
import useIsApp from "@/components/native/useIsApp";

// Eén formulier, twee gedaanten.
//   Website: de kaart op een lichte pagina, zoals altijd.
//   App:     schermvullend (boven de kopbalk en de tabbalk), indigo bovenaan met het logo — dezelfde
//            wereld als het opstart- en welkomstscherm — en het formulier als een wit blad eronder.
// Alles wat verschilt is CSS (`app:`), op de knoppen voor sociaal inloggen na: in de app kan de
// Google-knop van de website niet werken (Google weigert OAuth in een webview), dus daar staan de
// native knoppen, en alleen als die aan staan (lib/native/auth.js).
export default function LoginForm() {
  const params = useSearchParams();
  const nextUrl = params.get("next") || "/account";
  const urlError = params.get("error");
  const refCode = params.get("ref") || "";
  const [mode, setMode] = useState(params.get("mode") === "signup" || refCode ? "signup" : "login"); // 'login' | 'signup'
  const [state, formAction, pending] = useActionState(authAction, {});
  const [googleErr, setGoogleErr] = useState("");
  const app = useIsApp();
  const [native, setNative] = useState({ google: false, apple: false });
  const [nativeBusy, setNativeBusy] = useState("");

  useEffect(() => {
    if (!app) return;
    import("@/lib/native/auth").then((m) => m.nativeProviders()).then(setNative).catch(() => {});
  }, [app]);

  // signup_completed stond wél op de whitelist van /api/pv maar werd nergens afgevuurd: de grootste
  // uitvalstap van de trechter had dus geen enkel cijfer. Meten moet hier in de browser gebeuren
  // (lib/track gebruikt sendBeacon), en authAction geeft bij succes niets terug — hij stuurt je
  // meteen weg (redirect) of vraagt om e-mailbevestiging via state.info. Daarom kijken we naar het
  // moment waarop de actie klaar is zonder foutmelding. sendBeacon overleeft de navigatie die volgt.
  const wasPending = useRef(false);
  const signupCounted = useRef(false);
  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || mode !== "signup" || state?.error || signupCounted.current) return;
    signupCounted.current = true; // één registratie = één telling, ook als de pagina blijft staan
    track("signup_completed");
  }, [pending, mode, state]);

  // Een fout na het versturen voel je in de app ook.
  useEffect(() => {
    if (app && state?.error) import("@/lib/native/haptics").then((h) => h.hapticError()).catch(() => {});
  }, [app, state]);

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

  async function handleNative(provider) {
    setGoogleErr("");
    setNativeBusy(provider);
    try {
      const m = await import("@/lib/native/auth");
      const ok = provider === "apple" ? await m.appleLoginNative(nextUrl) : await m.googleLoginNative(nextUrl);
      if (!ok) setNativeBusy(""); // geannuleerd: gewoon terug naar het formulier, geen foutmelding
    } catch (e) {
      setNativeBusy("");
      setGoogleErr(provider === "apple" ? "Inloggen met Apple lukte niet. Probeer opnieuw of gebruik je e-mail." : "Inloggen met Google lukte niet. Probeer opnieuw of gebruik je e-mail.");
    }
  }

  const showNative = app && (native.google || native.apple);

  return (
    <main
      data-statusbar="light"
      className="bg-paper app:fixed app:inset-0 app:z-[70] app:overflow-y-auto app:overscroll-contain app:bg-brand"
    >
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-16 app:min-h-full app:justify-end app:px-0 app:py-0">
        {/* App: het merk bovenaan, in de wereld van het opstartscherm. */}
        <div className="hidden px-6 pb-8 app:block" style={{ paddingTop: "calc(var(--sat) + 1.25rem)" }}>
          <Link href="/app" aria-label="Terug" className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.svg" alt="Fittin’" className="mt-6 w-36" />
          <p className="mt-4 text-sm text-lav">
            {mode === "login" ? "Welkom terug. Je zaal staat klaar." : "Registreren is gratis — en je eerste uur ook."}
          </p>
        </div>

        <div
          className="rounded-3xl border border-borderc bg-surface p-8 shadow-sm app:rounded-b-none app:rounded-t-[28px] app:border-0 app:px-6 app:pt-8"
          style={{ paddingBottom: app ? "calc(var(--sab) + 1.75rem)" : undefined }}
        >
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">
            {mode === "login" ? "Welkom terug" : "Word lid"}
          </p>
          <h1 className="mt-2 text-3xl font-black">{mode === "login" ? "Inloggen" : "Account aanmaken"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            {mode === "login"
              ? "Log in om de gym te reserveren en je boekingen te beheren."
              : "Registreren is gratis. Je eerste sessie is automatisch gratis bij je eerste boeking."}
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

          {/* Website: de gewone Google-knop. In de app nooit (app:hidden), ook niet één frame. */}
          <div className="app:hidden">
            <button
              onClick={handleGoogle}
              disabled={!isSupabaseConfigured}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border-2 border-borderc bg-surface py-3 font-bold text-ink transition hover:border-lav disabled:opacity-40"
            >
              <GoogleIcon />
              Verder met Google
            </button>
          </div>

          {/* App: native aanmelden. Apple bovenaan en in zwart, zoals Apple's richtlijnen vragen. */}
          {showNative && (
            <div className="mt-6 space-y-3">
              {native.apple && (
                <button
                  onClick={() => handleNative("apple")}
                  disabled={!!nativeBusy}
                  className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-black font-bold text-white disabled:opacity-50"
                >
                  <AppleIcon />
                  {nativeBusy === "apple" ? "Even geduld…" : "Verder met Apple"}
                </button>
              )}
              {native.google && (
                <button
                  onClick={() => handleNative("google")}
                  disabled={!!nativeBusy}
                  className="flex h-[52px] w-full items-center justify-center gap-3 rounded-full border-2 border-borderc bg-surface font-bold text-ink disabled:opacity-50"
                >
                  <GoogleIcon />
                  {nativeBusy === "google" ? "Even geduld…" : "Verder met Google"}
                </button>
              )}
            </div>
          )}
          {googleErr && <p className="mt-2 text-sm font-semibold text-red-600">{googleErr}</p>}

          <div className={"my-5 items-center gap-3 text-xs font-semibold uppercase tracking-widest text-lav " + (showNative ? "flex" : "flex app:hidden")}>
            <span className="h-px flex-1 bg-borderc" /> of <span className="h-px flex-1 bg-borderc" />
          </div>

          {refCode && mode === "signup" && (
            <div className="mt-4 rounded-2xl bg-accent/10 p-3 text-sm font-semibold text-accentdark">
              {/* Alleen de nieuwe vriend krijgt tegoed: redeem_referral schrijft 1 credit weg voor
                  wie de code gebruikt, reward_pending_referral geeft de uitnodiger een punt op het
                  scoreboard (referral_points) en bewust géén sessie. Dezelfde belofte als /community. */}
              Je bent uitgenodigd met vriendcode <span className="font-black">{refCode}</span> — jouw gratis sessie staat klaar zodra je account er is. Wie je uitnodigde, krijgt er een punt op het scoreboard voor.
            </div>
          )}

          <form action={formAction} className="space-y-3 app:mt-6">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="next" value={nextUrl} />
            <input type="hidden" name="ref" value={refCode} />
            {mode === "signup" && <Field label="Naam" name="name" type="text" autoComplete="name" autoCapitalize="words" enterKeyHint="next" required />}
            <Field label="E-mail" name="email" type="email" inputMode="email" autoComplete={mode === "signup" ? "email" : "username"} autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" required />
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
              className="w-full rounded-full bg-accent py-3.5 font-bold text-brand transition hover:opacity-90 disabled:opacity-40 app:h-[52px] app:py-0"
            >
              {pending ? "Even geduld…" : mode === "login" ? "Inloggen" : "Account aanmaken"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-ink/60">
            {mode === "login" ? "Nog geen account?" : "Al een account?"}{" "}
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="font-bold text-accentdark hover:underline"
            >
              {mode === "login" ? "Word lid" : "Inloggen"}
            </button>
          </p>

          {/* App: wie nog niet wil registreren, mag eerst rondkijken (Apple 5.1.1: geen verplichte
              registratie voor wat geen account vraagt). */}
          <p className="mt-3 hidden text-center text-sm app:block">
            <Link href="/boeken" className="font-bold text-ink/50">Eerst rondkijken</Link>
          </p>
          {mode === "signup" && (
            <p className="mt-4 text-center text-xs leading-relaxed text-ink/45">
              Door een account te maken ga je akkoord met de <Link href="/voorwaarden" className="underline">voorwaarden</Link> en het <Link href="/privacy" className="underline">privacybeleid</Link>.
            </p>
          )}
        </div>

        <Link href="/" className="mt-6 text-center text-sm font-semibold text-ink/50 hover:text-ink app:hidden">
          ← Terug naar de site
        </Link>
      </div>
    </main>
  );
}

function Field({ label, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink">{label}</span>
      <input
        {...rest}
        className="w-full rounded-2xl border-2 border-borderc bg-surface px-4 py-3 text-ink outline-none transition focus:border-accent"
      />
    </label>
  );
}

function PasswordField({ autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink">Wachtwoord</span>
      <div className="relative">
        <input
          name="password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          enterKeyHint="go"
          required
          className="w-full rounded-2xl border-2 border-borderc bg-surface px-4 py-3 pr-12 text-ink outline-none transition focus:border-accent"
        />
        {/* Tikvlak i.p.v. enkel het icoon: 20×20 px haalde het WCAG-minimum van 24×24 niet, op de
            inlogpagina van de hele app. tabIndex={-1} is bewust weg — met het toetsenbord moet je
            je wachtwoord ook kunnen tonen. Het veld heeft pr-12, dus 44×44 past er zonder overlap. */}
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Verberg wachtwoord" : "Toon wachtwoord"}
          className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-ink/40 transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.480-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" aria-hidden="true" fill="currentColor">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4zM11.6 3c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}
