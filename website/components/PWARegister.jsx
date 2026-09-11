"use client";
import { useEffect } from "react";

// Registers the service worker so the site is installable as an app (PWA).
export default function PWARegister() {
  useEffect(() => {
    // Not inside the native app: a service worker in WKWebView only runs with app-bound domains,
    // which would restrict navigation and can break the plugin bridge. The app has its own
    // offline screen (native-shell/offline.html). Remove any worker a webview picked up earlier.
    if (document.documentElement.classList.contains("app")) {
      navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
