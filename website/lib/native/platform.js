import { Capacitor } from "@capacitor/core";

// Everything native goes through lib/native/*. Two different questions, two different answers:
//
//   isApp()     "should this LOOK like the app?" — the `app` class on <html>, set before first paint
//               from the FittinApp user agent (app/layout.jsx). CSS uses it via the `app:` variant.
//   isNative()  "can I call a plugin?" — the Capacitor bridge is really there.
//
// They agree in the shipped app. They are kept apart because the site and the binary deploy
// independently (Mode C): a web deploy must never call a plugin an older binary doesn't have.
// Hence `has(name)` before every plugin call, never a bare import-and-call.

export const isApp = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("app");

export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' */
export const platform = () => (typeof window === "undefined" ? "web" : Capacitor.getPlatform());

export const isIOS = () => platform() === "ios";
export const isAndroid = () => platform() === "android";

/** True only when the plugin exists in THIS binary. */
export const has = (name) => isNative() && Capacitor.isPluginAvailable(name);
