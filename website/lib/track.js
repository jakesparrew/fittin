"use client";

// Tiny first-party event beacon → /api/pv (same privacy pipeline as pageviews: no cookie, no PII).
// Usage: import { track } from "@/lib/track"; track("checkout_started").
// UTM params are captured once per session (first landing) and attached to the pageview beacon.

const UTM_KEY = "fittin_utm";

export function captureUtm() {
  if (typeof window === "undefined") return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    const src = sp.get("utm_source");
    if (src && !sessionStorage.getItem(UTM_KEY)) {
      const utm = { utm_source: src, utm_medium: sp.get("utm_medium") || "", utm_campaign: sp.get("utm_campaign") || "" };
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      return utm; // return so the very first pageview can attach it
    }
    return JSON.parse(sessionStorage.getItem(UTM_KEY) || "null");
  } catch { return null; }
}

function send(payload) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) navigator.sendBeacon("/api/pv", new Blob([body], { type: "application/json" }));
    else fetch("/api/pv", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch { /* best-effort */ }
}

// Fire a named funnel event. Only the whitelisted set in /api/pv is stored.
export function track(event, extra = {}) {
  if (typeof window === "undefined") return;
  send({ event, path: window.location.pathname, ...extra });
}
