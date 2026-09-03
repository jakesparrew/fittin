"use client";

// Tiny first-party event beacon → /api/pv (same privacy pipeline as pageviews: no cookie, no PII).
// Usage: import { track } from "@/lib/track"; track("checkout_started").
//
// UTM-labels worden rechtstreeks uit de URL gelezen en NIET bewaard. Dat is een bewuste juridische
// keuze: artikel 5(3) van de ePrivacy-richtlijn vraagt toestemming voor élke opslag op het toestel
// van de bezoeker die niet strikt noodzakelijk is — dus ook voor sessionStorage, niet enkel voor
// cookies. Campagne-attributie is duidelijk niet strikt noodzakelijk, en één regel opslag zou de
// hele site toestemmingsplichtig maken. Door niets weg te schrijven blijft Fittin' werken zonder
// cookiebanner. De landingspagina draagt het UTM-label — precies wat je nodig hebt om een campagne
// te tellen — en vervolgpagina's binnen hetzelfde bezoek tellen dus niet dubbel mee.
export function readUtm() {
  if (typeof window === "undefined") return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    const src = sp.get("utm_source");
    if (!src) return null;
    // utm_content erbij: dat onderscheidt de ADVERTENTIES binnen één campagne (zaal/niemand/coach…).
    // Zonder dit label weet je wel dát meta verkeer bracht, maar niet wélke advertentie werkte.
    return {
      utm_source: src,
      utm_medium: sp.get("utm_medium") || "",
      utm_campaign: sp.get("utm_campaign") || "",
      utm_content: sp.get("utm_content") || "",
    };
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
// De UTM-spread staat hier om dezelfde reden als in PageView: zonder campagnelabel op het event
// weet je wel dát een campagne verkeer bracht, maar niet of dat verkeer ook boekte. De intentie-
// kolom van de campagnerapportage vult zich enkel als élk event zijn herkomst meedraagt.
// `extra` staat achteraan zodat een expliciet meegegeven label het URL-label mag overschrijven.
export function track(event, extra = {}) {
  if (typeof window === "undefined") return;
  send({ event, path: window.location.pathname, ...(readUtm() || {}), ...extra });
}
