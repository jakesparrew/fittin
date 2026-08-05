"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { readUtm } from "@/lib/track";

// First-party page-view tracker: fires one beacon per route change to /api/pv. Skips staff areas
// (those are filtered server-side too). Geen cookies, geen sessionStorage, geen PII — daardoor is
// er geen toestemmingsbanner nodig; zie /cookies en de toelichting in lib/track.js.
export default function PageView() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/beheer") || pathname.startsWith("/coach")) return;
    const utm = readUtm() || {}; // campagnelabels uit de URL van dit bezoek, niets bewaard
    const payload = JSON.stringify({ path: pathname, ref: document.referrer || "", ...utm });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/pv", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/pv", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch {}
  }, [pathname]);
  return null;
}
