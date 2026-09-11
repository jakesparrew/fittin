import { has } from "./platform";

// The hosts the app itself lives on. Links to anything else never navigate the webview: they open
// in an in-app Safari (SFSafariViewController) / Chrome Custom Tab, which the member closes to be
// right back where they were. Keep in sync with server.allowNavigation in capacitor.config.js.
export const OWN_HOSTS = ["fittin.be", "www.fittin.be"];

export function isOwnUrl(url) {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : "https://fittin.be");
    return OWN_HOSTS.includes(u.hostname) || (typeof location !== "undefined" && u.host === location.host);
  } catch {
    return false;
  }
}

/** Open an external URL: in-app browser in the app, new tab on the web. */
export async function openExtern(url) {
  if (has("Browser")) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, toolbarColor: "#22194F", presentationStyle: "popover" });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
