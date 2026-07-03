"use client";
import { useEffect, useState } from "react";

const KEY = "fittin-ios-relogin-dismissed";

// Batch 7.2 — iOS PWA re-login nudge. When Fittin' runs as an installed app on iOS, Safari's cookies
// don't transfer into the standalone container, so a just-installed user lands logged-out and confused.
// Show a one-time, dismissible hint to log in — only in that exact situation.
export default function IosReloginNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    if (!standalone || !isIos) return;
    try { if (localStorage.getItem(KEY)) return; } catch {}
    if (["/login", "/wachtwoord-vergeten", "/wachtwoord-herstellen"].some((p) => window.location.pathname.startsWith(p))) return;
    // Only nudge if actually logged out.
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!d?.loggedIn) setShow(true); })
      .catch(() => {});
  }, []);

  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3" role="dialog" aria-label="Opnieuw inloggen">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-borderc bg-white p-3 shadow-xl shadow-brand/10">
        <span className="text-xl">👋</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-brand">Welkom in de Fittin&rsquo;-app</p>
          <p className="mt-0.5 text-xs leading-snug text-brand/60">Log één keer opnieuw in — daarna blijf je ingelogd in de app.</p>
        </div>
        <a href="/login" className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand transition hover:opacity-90">Inloggen</a>
        <button onClick={dismiss} aria-label="Sluiten" className="shrink-0 rounded-full p-1.5 text-brand/40 transition hover:bg-paper hover:text-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
