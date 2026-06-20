"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// First-party page-view tracker: fires one beacon per route change to /api/pv. Skips staff areas
// (those are filtered server-side too). No cookies, no PII — see /api/pv.
export default function PageView() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/beheer") || pathname.startsWith("/coach")) return;
    const payload = JSON.stringify({ path: pathname, ref: document.referrer || "" });
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
