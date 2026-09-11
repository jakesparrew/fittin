import { registerPlugin } from "@capacitor/core";
import { has } from "./platform";

// Bridge to the app's own local plugin (ios/App/App/plugins/FittinNativePlugin.swift,
// android/.../plugins/FittinNativePlugin.java).
//
// capabilities() is how a web deploy learns what THIS binary can do, so the site never calls
// something an older install lacks. Android reports push=false until google-services.json is in
// the build: registering for push without Firebase crashes the app instead of rejecting.
//
// Methods (not all exist on every platform — always check has()/capabilities first):
//   capabilities()                → { push, apnsEnvironment?, webAuth, appleSignIn, build }
//   webAuth({ url, callbackScheme }) → { url }   iOS: ASWebAuthenticationSession
//   appleSignIn({ nonce })        → { identityToken, givenName?, familyName?, email? }   iOS
//   setInterfaceStyle({ style })  'light' | 'dark' — native chrome follows the site's theme
//   clearBadge()
export const FittinNative = registerPlugin("FittinNative");

export const fittinNativeAvailable = () => has("FittinNative");

let caps;
/** Cached per page load. Resolves {} on the web or on a binary without the plugin. */
export function capabilities() {
  if (!fittinNativeAvailable()) return Promise.resolve({});
  return (caps ??= FittinNative.capabilities().catch(() => ({})));
}
