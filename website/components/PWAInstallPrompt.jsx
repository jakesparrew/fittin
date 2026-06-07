"use client";
import { useEffect, useState } from "react";

const DISMISS_KEY = "fittin-pwa-dismissed";
const DISMISS_DAYS = 14; // don't nag — re-ask only after two weeks

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
const recentlyDismissed = () => {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t && Date.now() - t < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
};

// Mobile-only "install our app" banner. Android/Chrome → native install via beforeinstallprompt.
// iOS Safari → manual "add to home screen" instructions (no install API there).
export default function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || !isMobile() || recentlyDismissed()) return;

    const onBIP = (e) => {
      e.preventDefault(); // suppress the mini-infobar; we show our own UI
      setDeferred(e);
      setShow(true);
    };
    const onInstalled = () => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
      setShow(false);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    let t;
    if (isIos()) {
      setIos(true);
      t = setTimeout(() => setShow(true), 2500); // give the page a moment first
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);

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
