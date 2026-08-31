"use client";
import { useEffect } from "react";

// Mounts once in the root layout. Ships uncaught JS errors + unhandled promise rejections to the
// first-party /api/log-error sink (no external SDK). Throttled to avoid loops.
export default function ErrorLogger() {
  useEffect(() => {
    let sent = 0;
    const post = (message, stack) => {
      if (sent >= 10 || !message) return; // hard cap per page load — never a feedback loop
      sent++;
      try {
        const body = JSON.stringify({ message: String(message).slice(0, 1000), stack: stack ? String(stack).slice(0, 4000) : null, path: location.pathname });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/log-error", new Blob([body], { type: "application/json" }));
        else fetch("/api/log-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
      } catch { /* ignore */ }
    };
    // Een afwijzing hoeft geen Error te zijn. Bij een mislukte resource (afbeelding, script) of een
    // afgebroken verzoek is `reason` een Event, en die serialiseert als "[object Event]" — dat stond
    // zo in de foutenlijst en zegt niets: je weet niet wát er niet laadde. Haal er daarom uit wat er
    // wél in zit: het type en het element of de URL die faalde.
    const beschrijf = (reason) => {
      if (!reason) return "?";
      if (reason.message) return reason.message;
      if (typeof Event !== "undefined" && reason instanceof Event) {
        const t = reason.target || {};
        const bron = t.src || t.href || t.url || "";
        const wat = t.tagName ? t.tagName.toLowerCase() : reason.type || "event";
        return `${reason.type || "event"} op ${wat}${bron ? " " + String(bron).slice(0, 200) : ""}`;
      }
      return String(reason);
    };
    const onErr = (e) => post(e.message || "window.onerror", e.error?.stack);
    const onRej = (e) => post("unhandledrejection: " + beschrijf(e.reason), e.reason?.stack);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
