"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/track";

const DISMISS_KEY = "fittin-pwa-dismissed";
const FIRST_SEEN_KEY = "fittin-eerste-bezoek";
const DISMISS_DAYS = 14; // don't nag — re-ask only after two weeks
const RETURN_AFTER_MS = 24 * 3600 * 1000; // pas een dag later terug = terugkerend bezoek

// Ingelogde routes: daar heeft de app zich al bewezen, dus daar mag de installatievraag meteen.
const APP_ROUTES = ["/account", "/training", "/plannen", "/coach", "/beheer", "/notificaties", "/community"];
// Nooit tijdens boeken of aanmelden: daar staat onderaan de bevestigbalk, en elke onderbreking
// in die flow kost een boeking.
const BLOCKED_ROUTES = ["/boeken", "/login", "/auth", "/wachtwoord"];

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
// In-app browsers (Instagram, Facebook, TikTok …) matchten op de iOS-detectie terwijl daar geen
// "Zet op beginscherm" bestaat en beforeinstallprompt nooit vuurt — de banner kon er dus alleen
// maar in de weg staan.
const isInAppBrowser = () =>
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|LinkedInApp|Twitter|Snapchat|Pinterest|TikTok|MicroMessenger|Line\/|GSA\//i.test(navigator.userAgent);
const recentlyDismissed = () => {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t && Date.now() - t < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
};
// Registreert het eerste bezoek en zegt of dit een terugkerend bezoek is. Een koude bezoeker die
// net op de site landt, krijgt niets te zien.
const markVisitAndCheckReturning = () => {
  try {
    const first = Number(localStorage.getItem(FIRST_SEEN_KEY) || 0);
    if (!first) {
      localStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
      return false;
    }
    return Date.now() - first > RETURN_AFTER_MS;
  } catch {
    return false;
  }
};

// Mobile-only "install our app" banner. Android/Chrome → native install via beforeinstallprompt.
// iOS Safari → manual "add to home screen" instructions (no install API there).
export default function PWAInstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [allowed, setAllowed] = useState(false); // toestel/instellingen laten de vraag toe
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || !isMobile() || isInAppBrowser() || recentlyDismissed()) return;

    const onBIP = (e) => {
      e.preventDefault(); // suppress the mini-infobar; we show our own UI
      setDeferred(e);
    };
    const onInstalled = () => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      track("install_accepted");
      setShow(false);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    setIos(isIos());
    setReturning(markVisitAndCheckReturning());
    setAllowed(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Wanneer tonen: enkel op een ingelogde route of bij een terugkerend bezoek, en nooit midden in
  // de boekflow. Draait opnieuw bij navigatie, zodat de banner ook weer verdwijnt.
  useEffect(() => {
    if (!allowed) return;
    const path = pathname || "/";
    const welcome =
      !BLOCKED_ROUTES.some((p) => path.startsWith(p)) &&
      (returning || APP_ROUTES.some((p) => path.startsWith(p)));
    if (!welcome) {
      setShow(false);
      return;
    }
    if (!ios && !deferred) return; // Android: pas zodra de browser installatie aanbiedt
    const t = setTimeout(() => setShow(true), 2500); // give the page a moment first
    return () => clearTimeout(t);
  }, [allowed, returning, pathname, ios, deferred]);

  useEffect(() => { if (show) track("install_prompt_shown"); }, [show]);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    setDeferred(null);
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 md:hidden" role="dialog" aria-label="App installeren">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-borderc bg-white p-3 shadow-xl shadow-brand/10">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="Fittin'" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-brand">Zet Fittin&rsquo; op je telefoon</p>
          {ios ? (
            <p className="mt-0.5 text-xs leading-snug text-brand/60">
              Tik op <span className="font-bold">Deel</span> <span aria-hidden>⬆️</span> en dan op{" "}
              <span className="font-bold">&ldquo;Zet op beginscherm&rdquo;</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-brand/60">Boek en open de deur sneller — installeer de app.</p>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand transition hover:opacity-90">
            Installeren
          </button>
        )}
        <button onClick={dismiss} aria-label="Sluiten" className="shrink-0 rounded-full p-1.5 text-brand/40 transition hover:bg-paper hover:text-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
