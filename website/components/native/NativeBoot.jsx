"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { has, isNative, platform } from "@/lib/native/platform";
import { isOwnUrl, openExtern } from "@/lib/native/browser";
import { SCHEME, finishOAuthCallback } from "@/lib/native/auth";
import { initPushListeners, registerIfGranted } from "@/lib/native/push";
import { FittinNative, fittinNativeAvailable } from "@/lib/native/fittinNative";
import { isTabRoot } from "@/components/tabs";
import { isDarkTheme, onThemeChange } from "./theme";

// The app's native lifecycle, mounted once (app only, via NativeGate). Everything here degrades to
// a no-op when a plugin is missing from the installed binary.
//
//   splash      hidden as soon as the first page has painted (the config duration is a ceiling)
//   back        Android back: close an overlay → go back → minimise at a tab root
//   links       universal/app links + the OAuth return → router
//   external    links to other sites open in an in-app browser, never in the webview
//   resume      fresh data, re-register push, clear the badge, re-check the forced update
//   network     an offline banner instead of silently failing forms
//   keyboard    tells the tab bar to step aside
//   chrome      status bar + native dialogs follow the page and the site's own theme
export default function NativeBoot() {
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    if (!isNative()) return;
    const handles = [];
    const nav = (path) => routerRef.current.push(path);

    // 1. Splash: two frames after mount the page has painted.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (has("SplashScreen")) import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 })).catch(() => {});
    }));

    // 2. Incoming URLs.
    const handleUrl = (url) => {
      if (!url) return;
      if (url.startsWith(`${SCHEME}://`)) {
        // A Custom Tab sign-in that is still running handles its own return (lib/native/auth.js).
        // This branch is the app having been killed in between: finish it here.
        if (!window.__fittinAuthPending && url.includes("auth/callback")) finishOAuthCallback(url);
        return;
      }
      try {
        const u = new URL(url);
        if (isOwnUrl(u.href)) nav(u.pathname + u.search + u.hash);
      } catch { /* not a URL we know */ }
    };

    if (has("App")) {
      import("@capacitor/app").then(({ App }) => {
        handles.push(App.addListener("backButton", ({ canGoBack }) => {
          // Open overlays (menu, drawer, sheet) listen for this and call preventDefault().
          const unhandled = window.dispatchEvent(new CustomEvent("fittin:back", { cancelable: true }));
          if (!unhandled) return;
          if (canGoBack && !isTabRoot(pathRef.current)) window.history.back();
          else App.minimizeApp();
        }));
        handles.push(App.addListener("appUrlOpen", ({ url }) => handleUrl(url)));
        handles.push(App.addListener("resume", onResume));
        // Cold start from a link. Once per app session: this component mounts again after every
        // full page load (e.g. the /auth/callback redirect), and must not replay the link.
        App.getLaunchUrl().then((r) => {
          try {
            if (!r?.url || sessionStorage.getItem("fittin-launch-url") === r.url) return;
            sessionStorage.setItem("fittin-launch-url", r.url);
          } catch { /* storage blocked: handle it anyway */ }
          handleUrl(r?.url);
        }).catch(() => {});
        checkForcedUpdate(App).then(setUpdate);
      }).catch(() => {});
    }

    function onResume() {
      routerRef.current.refresh();
      registerIfGranted();
      if (fittinNativeAvailable()) FittinNative.clearBadge().catch(() => {});
      if (has("App")) import("@capacitor/app").then(({ App }) => checkForcedUpdate(App).then(setUpdate)).catch(() => {});
    }

    // 3. External links never navigate the webview.
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || /^(mailto|tel|sms):/i.test(href)) return; // the OS handles these
      let u;
      try { u = new URL(a.href); } catch { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      if (!isOwnUrl(u.href)) {
        e.preventDefault();
        openExtern(u.href);
        return;
      }
      // Our own page in a "new tab" (invoices, receipts): there are no tabs in an app.
      if (a.target === "_blank") {
        e.preventDefault();
        if (u.pathname.startsWith("/api/")) window.location.href = u.href; // a file, not a page
        else nav(u.pathname + u.search + u.hash);
      }
    };
    document.addEventListener("click", onClick, true);

    // 4. Network.
    if (has("Network")) {
      import("@capacitor/network").then(({ Network }) => {
        Network.getStatus().then((s) => setOffline(!s.connected)).catch(() => {});
        handles.push(Network.addListener("networkStatusChange", (s) => {
          setOffline(!s.connected);
          if (s.connected) routerRef.current.refresh();
        }));
      }).catch(() => {});
    }

    // 5. Keyboard: the tab bar and the keyboard never share the bottom of the screen.
    if (has("Keyboard")) {
      import("@capacitor/keyboard").then(({ Keyboard }) => {
        const set = (open) => {
          document.documentElement.classList.toggle("keyboard-open", open);
          window.dispatchEvent(new CustomEvent("fittin:keyboard", { detail: { open } }));
        };
        handles.push(Keyboard.addListener("keyboardWillShow", () => set(true)));
        handles.push(Keyboard.addListener("keyboardWillHide", () => set(false)));
      }).catch(() => {});
    }

    // 6. Push: listeners first (a tap may be what launched us), then the silent re-register.
    initPushListeners(nav).then(registerIfGranted).catch(() => {});
    if (fittinNativeAvailable()) FittinNative.clearBadge().catch(() => {});

    // 7. Native chrome follows the site's theme.
    const applyStyle = () => {
      if (fittinNativeAvailable()) FittinNative.setInterfaceStyle({ style: isDarkTheme() ? "dark" : "light" }).catch(() => {});
      applyStatusBar();
    };
    applyStyle();
    const stopTheme = onThemeChange(applyStyle);

    return () => {
      document.removeEventListener("click", onClick, true);
      stopTheme();
      handles.forEach((h) => Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}));
    };
  }, []);

  // The status bar follows the page: light text over an indigo top, dark text over a light one.
  useEffect(() => {
    if (!isNative()) return;
    const id = requestAnimationFrame(applyStatusBar);
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <>
      {offline && (
        <div
          role="status"
          className="anim-fade pointer-events-none fixed inset-x-0 top-0 z-[110] flex justify-center px-4"
          style={{ paddingTop: "calc(var(--sat) + 6px)" }}
        >
          <span className="rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-surface shadow-lg">
            Geen verbinding — wat je ziet kan verouderd zijn
          </span>
        </div>
      )}
      {update && <UpdateGate storeUrl={update.storeUrl} />}
    </>
  );
}

function applyStatusBar() {
  if (!has("StatusBar")) return;
  const lightText = isDarkTheme() || !!document.querySelector('[data-statusbar="light"]');
  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    // Style.Dark = light text, for dark backgrounds (Capacitor's naming).
    StatusBar.setStyle({ style: lightText ? Style.Dark : Style.Light }).catch(() => {});
  }).catch(() => {});
}

// The server can retire old binaries (APP_MIN_BUILD). Below it, the app shows one blocking screen
// with a store button instead of calling server code the old binary can't handle.
async function checkForcedUpdate(App) {
  try {
    const [info, cfg] = await Promise.all([
      App.getInfo(),
      fetch("/api/app-config", { cache: "no-store" }).then((r) => r.json()),
    ]);
    const build = Number(info?.build) || 0;
    if (!cfg?.minBuild || build >= cfg.minBuild) return null;
    return { storeUrl: platform() === "android" ? cfg.androidStoreUrl : cfg.iosStoreUrl };
  } catch {
    return null; // offline or old server: never block on a failed check
  }
}

function UpdateGate({ storeUrl }) {
  return (
    <div className="anim-fade fixed inset-0 z-[200] flex flex-col items-center justify-center bg-brand px-8 text-center text-white" data-statusbar="light">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-white.svg" alt="Fittin’" className="w-40" />
      <h1 className="mt-10 text-2xl font-black">Er is een nieuwe versie</h1>
      <p className="mt-3 max-w-xs text-sm text-lav">Deze versie van de app wordt niet meer ondersteund. Werk hem bij om verder te boeken en de deur te openen.</p>
      <button
        type="button"
        onClick={() => { window.location.href = storeUrl; }}
        className="mt-8 rounded-full bg-accent px-8 py-3.5 font-black text-brand"
      >
        Bijwerken
      </button>
    </div>
  );
}
