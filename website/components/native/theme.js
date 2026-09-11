// The site's EFFECTIVE theme (licht / donker / systeem → light or dark), for native chrome that has
// to follow it: status bar text, the iOS tab bar, native alerts. Mirrors the rules in globals.css:
// light is the default; "system" follows the phone.

export function isDarkTheme() {
  if (typeof document === "undefined") return false;
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "system") return window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
  return false;
}

/** Calls `fn` whenever the effective theme may have changed. Returns an unsubscribe. */
export function onThemeChange(fn) {
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", fn);
  return () => {
    mo.disconnect();
    mq?.removeEventListener?.("change", fn);
  };
}
