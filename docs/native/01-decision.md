# Native app — architecture decision

## Variables

```
APP_NAME          = Fittin'            (store name — owner may pick "Fittin' Gent")
APP_DISPLAY_NAME  = Fittin’            (typographic apostrophe: safe in strings.xml, matches the wordmark)
BUNDLE_ID         = be.fittin.app      (iOS + Android, permanent)
WEB_DOMAIN        = fittin.be
START_URL         = https://fittin.be/app
BRAND_COLOR       = #22194F  (indigo)  · ACCENT #5FDA6B (green)
MUTED_COLOR       = #8E8A9E
LAUNCH_BACKGROUND = #22194F            (launch screen, splash, welcome screen share it)
SUPPORTS_IPAD     = no (iPhone only, portrait)
AUTH_BACKEND      = supabase (cookie sessions)
FRAMEWORK         = next-server → MODE C (remote shell)
```

## Why Mode C (remote shell)

The playbook's tree (§2): the app needs SSR, Server Components that read with the user's cookie,
~40 files of Server Actions, and cookie sessions. A static export (Mode B) would mean rewriting
every page to client fetching and every Server Action to an API route — a new app, not a port.

Mode C keeps **one codebase and one deploy**. The native binary loads `https://fittin.be/app`
and the site itself becomes app-aware. Cookies are first-party (same origin), so the existing
auth works untouched.

Accepted risks, and how they are handled:

| Risk | Mitigation |
| --- | --- |
| 4.2 minimum functionality | Native UITabBar (iOS), push, native door-open haptics, native dialogs/share/browser, deep links, offline screen, native Apple/Google sign-in. All listed in the review notes. |
| `server.url` "not for production" (Capacitor team) | Accepted knowingly; many live apps do it. Offline `errorPath` + splash cap make a dead network visible, never a white screen. |
| Web deploy calls a plugin an old binary lacks | Every plugin call goes through `lib/native/*` and checks `Capacitor.isPluginAvailable()`; the local plugin reports `capabilities()`. |
| Stale chunks under a long-lived webview | Existing `ChunkErrorRecovery` (reload once) + `resume` refresh. |

## How the site knows it is in the app — without a flash, without going dynamic

The native shell appends `FittinApp/1` to the user agent. An inline script (same place as the
theme script, before first paint) adds `app` + `ios|android` classes to `<html>`. Tailwind
custom variants (`app:`, `ios:`, `android:`, `nativebar:`) do the rest in CSS.

Reading the UA with `headers()` in the root layout was rejected: it would make every page
dynamic, including the static, cached marketing pages.

## Key choices

- **Tab bar:** iOS gets a real `UITabBar` laid over the single webview (playbook §10, labels
  baked into the image for iOS 26 Liquid Glass). Android keeps the existing React bottom bar.
  Tabs are role-aware (guest / lid / coach / beheerder), same source as today (`/api/me`).
- **Start screen:** `/app` — logged in → role home, logged out → a branded welcome screen that
  continues the launch screen (same indigo, same logo position).
- **Login:** e-mail/password works as-is. Google (both platforms) + Apple (iOS) go native and
  switch on together with `NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN=1` once the owner has configured
  them; until then the app offers e-mail only, which keeps Apple 4.8 satisfied.
  Google uses ASWebAuthenticationSession (iOS) / Custom Tabs (Android) with a
  `be.fittin.app://auth/callback` redirect; the PKCE verifier stays in the webview's cookie jar,
  so the existing `/auth/callback` route finishes the exchange. Apple uses the native
  AuthenticationServices sheet → `signInWithIdToken`.
- **Payments:** Stripe Checkout runs inside the webview (`checkout.stripe.com`, `hooks.stripe.com`
  allowed). Redirect-based methods that leave for a bank app finish in Safari; the webhook still
  books it and the app refreshes on resume.
- **Push:** APNs direct + FCM HTTP v1, sent from `lib/notify.js` so every existing in-app
  notification also pushes. No keys → silently off.
- **Theme:** native chrome (status bar, tab bar, dialogs) follows the site's effective theme.
