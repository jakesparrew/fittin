"use client";
import { useSyncExternalStore } from "react";
import { isApp } from "@/lib/native/platform";

// True inside the native app. The `app` class is set before first paint and never changes, so
// there is nothing to subscribe to. The server snapshot is `false`; useSyncExternalStore then
// re-renders with the client value right after hydration — no hydration mismatch.
//
// Prefer the CSS `app:` variant for anything visual (no flash at all). Use this hook only for
// behaviour or for markup that must differ (e.g. which tabs exist).
const subscribe = () => () => {};
export default function useIsApp() {
  return useSyncExternalStore(subscribe, isApp, () => false);
}
