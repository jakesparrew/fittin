import { createClient } from "@/lib/supabase/client";
import { has, isIOS, isAndroid } from "./platform";
import { FittinNative, capabilities } from "./fittinNative";

// Native sign-in for the app.
//
// Why not the website's Google button: Google refuses OAuth inside embedded webviews
// (disallowed_useragent), and the Supabase host is not in the app's navigation allow-list, so the
// redirect would bounce out to Safari and log the member in THERE, not in the app.
//
// Google: open the Supabase authorize URL in ASWebAuthenticationSession (iOS) / a Custom Tab
// (Android) with redirect be.fittin.app://auth/callback. The PKCE verifier was written into the
// webview's cookie jar by signInWithOAuth, so the existing /auth/callback route can finish the
// code exchange server-side exactly like on the web. No new Google client is needed.
//
// Apple (iOS): the native AuthenticationServices sheet → identity token → signInWithIdToken.
//
// Both are switched on together by NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN=1 (Apple 4.8: offering Google
// in the iOS app requires Sign in with Apple too). Until then the app offers e-mail only.

export const SCHEME = "be.fittin.app";
const CALLBACK = `${SCHEME}://auth/callback`;
const NEXT_KEY = "fittin-auth-next";

export const nativeSocialLoginEnabled = () => process.env.NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN === "1";

/** Which native providers this binary can show right now. */
export async function nativeProviders() {
  if (!nativeSocialLoginEnabled()) return { google: false, apple: false };
  const caps = await capabilities();
  return {
    google: (isIOS() && !!caps.webAuth) || (isAndroid() && has("Browser") && has("App")),
    apple: isIOS() && !!caps.appleSignIn,
  };
}

// ---------- Google ----------

/** Resolves false when the member cancels. Throws on a real error. */
export async function googleLoginNative(next = "/account") {
  const sb = createClient();
  // The return path goes through sessionStorage, not the redirect URL: Supabase matches redirect
  // URLs against its allow-list literally, so a query string would need a wildcard entry.
  try { sessionStorage.setItem(NEXT_KEY, next); } catch { /* falls back to /account */ }
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const callbackUrl = await openAuthSession(data.url);
  if (!callbackUrl) return false;
  finishOAuthCallback(callbackUrl);
  return true;
}

async function openAuthSession(url) {
  if (isIOS()) {
    try {
      const r = await FittinNative.webAuth({ url, callbackScheme: SCHEME });
      return r?.url || null;
    } catch (e) {
      if (String(e?.code || e?.message).toLowerCase().includes("cancel")) return null;
      throw e;
    }
  }
  // Android: a Custom Tab, then wait for the be.fittin.app:// intent to bring us back.
  const [{ Browser }, { App }] = await Promise.all([import("@capacitor/browser"), import("@capacitor/app")]);
  return new Promise((resolve) => {
    let done = false;
    const handles = [];
    const finish = (value) => {
      if (done) return;
      done = true;
      handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
      resolve(value);
    };
    handles.push(App.addListener("appUrlOpen", ({ url: u }) => {
      if (u?.startsWith(`${SCHEME}://`)) {
        Browser.close().catch(() => {});
        finish(u);
      }
    }));
    // Closed the tab without finishing: treat as a cancel, not an error.
    handles.push(Browser.addListener("browserFinished", () => setTimeout(() => finish(null), 400)));
    Browser.open({ url, toolbarColor: "#22194F" }).catch(() => finish(null));
  });
}

/** be.fittin.app://auth/callback?code=… → the website's own /auth/callback does the exchange. */
export function finishOAuthCallback(callbackUrl) {
  const u = new URL(callbackUrl);
  let next = "/account";
  try { next = sessionStorage.getItem(NEXT_KEY) || next; sessionStorage.removeItem(NEXT_KEY); } catch { /* keep default */ }
  const params = new URLSearchParams({ next });
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error_description") || u.searchParams.get("error");
  if (code) params.set("code", code);
  if (err) params.set("error", err);
  window.location.href = `/auth/callback?${params}`;
}

// ---------- Apple (iOS) ----------

/** Resolves false when the member cancels. Throws on a real error. */
export async function appleLoginNative(next = "/account") {
  const raw = randomNonce();
  let res;
  try {
    // Apple gets the SHA-256 of the nonce, Supabase gets the raw value (its convention).
    res = await FittinNative.appleSignIn({ nonce: await sha256Hex(raw) });
  } catch (e) {
    if (String(e?.code || e?.message).toLowerCase().includes("cancel")) return false;
    throw e;
  }
  const sb = createClient();
  const { error } = await sb.auth.signInWithIdToken({ provider: "apple", token: res.identityToken, nonce: raw });
  if (error) throw error;
  // Apple sends the name ONLY on the very first authorisation. Keep it now or never.
  const fullName = [res.givenName, res.familyName].filter(Boolean).join(" ");
  if (fullName) await sb.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
  // Same post-login path as Google and e-mail links (welcome mail, drips, role home).
  window.location.href = `/auth/callback?native=1&next=${encodeURIComponent(next)}`;
  return true;
}

function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
