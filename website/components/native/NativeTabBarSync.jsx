"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/components/useMe";
import { tabsFor, isTabActive, APP_NO_TABBAR } from "@/components/tabs";
import { NativeTabBar, nativeTabBarAvailable } from "@/lib/native/nativeTabBar";
import { hapticSelect } from "@/lib/native/haptics";
import { isDarkTheme, onThemeChange } from "./theme";

// Drives the native iOS UITabBar from the site: which tabs (role-aware, same list as the web bar),
// which one is active, the unread badge, and when to step aside. Mounted at the ROOT layout, so the
// bar also stays on /coach and /beheer. Renders nothing itself.
//
// Contract with CSS:
//   html.nativebar            the native bar is live → the React bottom bar hides
//   --native-tabbar-h         its height while visible, 0 while hidden → content padding follows
// If configure() fails (older binary, no plugin) the class is removed and the React bar is back.
// Never no bar.

const COLORS = {
  light: { tintColor: "#22194F", unselectedColor: "#8E8A9E", style: "light" },
  dark: { tintColor: "#5FDA6B", unselectedColor: "#8E8A9E", style: "dark" },
};

export default function NativeTabBarSync() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const me = useMe();
  const [live, setLive] = useState(nativeTabBarAvailable);
  const [keyboard, setKeyboard] = useState(false);
  const [dark, setDark] = useState(isDarkTheme);
  const heightRef = useRef(0);
  const routerRef = useRef(router);
  routerRef.current = router;

  const role = me ? (me.loggedIn ? me.role || "lid" : null) : undefined; // undefined = still loading
  const unread = me?.unread || 0;
  const tabs = tabsFor(role, { app: true });
  const activeId = tabs.find((t) => isTabActive(t.href, pathname))?.href || "";
  const visible = role !== undefined && !keyboard && !APP_NO_TABBAR.some((p) => pathname.startsWith(p));

  const items = tabs.map((t) => ({
    id: t.href,
    title: t.label,
    sfSymbol: t.sf,
    badge: t.href === "/account" && unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null,
  }));
  const sig = JSON.stringify([items, dark]);
  const latest = useRef({ activeId, visible });
  latest.current = { activeId, visible };

  // Theme + keyboard.
  useEffect(() => onThemeChange(() => setDark(isDarkTheme())), []);
  useEffect(() => {
    const onKb = (e) => setKeyboard(!!e.detail?.open);
    window.addEventListener("fittin:keyboard", onKb);
    return () => window.removeEventListener("fittin:keyboard", onKb);
  }, []);

  // Tab taps → router. Tapping the tab you're on scrolls to the top, like every native app.
  useEffect(() => {
    if (!live) return;
    const h = NativeTabBar.addListener("tabSelect", ({ id, reselected }) => {
      hapticSelect();
      if (reselected) window.scrollTo({ top: 0, behavior: "smooth" });
      else routerRef.current.push(id);
    });
    return () => { h.then((x) => x.remove()).catch(() => {}); };
  }, [live]);

  // (Re)build only when the item set, badge or theme changes.
  useEffect(() => {
    if (!live || role === undefined) return;
    let cancelled = false;
    NativeTabBar.configure({ items, ...latest.current, ...COLORS[dark ? "dark" : "light"] })
      .then(({ height }) => {
        if (cancelled) return;
        heightRef.current = height;
        document.documentElement.classList.add("nativebar");
        document.documentElement.style.setProperty("--native-tabbar-h", latest.current.visible ? `${height}px` : "0px");
      })
      .catch(() => {
        if (cancelled) return;
        document.documentElement.classList.remove("nativebar");
        setLive(false);
      });
    return () => { cancelled = true; };
  }, [live, sig, role === undefined]);

  useEffect(() => {
    if (live) NativeTabBar.setActiveId({ id: activeId }).catch(() => {});
  }, [live, activeId]);

  useEffect(() => {
    if (!live) return;
    NativeTabBar.setVisible({ visible }).catch(() => {});
    if (heightRef.current) document.documentElement.style.setProperty("--native-tabbar-h", visible ? `${heightRef.current}px` : "0px");
  }, [live, visible]);

  useEffect(() => () => {
    document.documentElement.classList.remove("nativebar");
    if (nativeTabBarAvailable()) NativeTabBar.destroy().catch(() => {});
  }, []);

  return null;
}
