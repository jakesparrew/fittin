# Native app — audit (2026-09-11)

Written before any native change, per the Web → Native playbook §1.

## What the web app is

| Aspect | Finding |
| --- | --- |
| Framework | Next.js 15 App Router, plain JSX, Tailwind v4 (`app/globals.css` tokens, dark theme via `data-theme`). Lives in `website/`. |
| Rendering | Server-heavy. Most pages are Server Components that read Supabase with the user's cookie (`lib/auth.getSessionProfile`), `force-dynamic` in the member/coach/admin areas. |
| Mutations | ~40 `actions.js` files with **Server Actions** (booking, payments, door, coaching, admin). No separate REST API for them. |
| API routes | `app/api/*`: `/api/me`, slots, cron jobs, Stripe + Resend webhooks, exports. |
| Auth | Supabase Auth via `@supabase/ssr` → **cookie sessions** (server + browser client). Email/password + Google OAuth (redirect flow via `/auth/callback`, PKCE). No middleware. |
| Payments | Stripe Checkout, created in Server Actions, then `redirect(session.url)` / `window.location = checkoutUrl`. Real-world services (gym time, PT) → no IAP needed (Apple 3.1.3(e)). |
| Door | `openDoorAction` (Nuki) — the strongest "native value" feature. |
| Notifications | In-app bell (`notifications` table, `lib/notify.js`), e-mail via Resend. No push yet. |
| PWA | `app/manifest.js`, `public/sw.js` (cache-first for `/_next/static`, network-first + `/offline`), install prompt, iOS "log in again" nudge. |
| Insets | Only `BottomTabBar` uses `env(safe-area-inset-bottom)`. Viewport has no `viewport-fit=cover`. |

## Browser-only APIs in use

- `window.confirm` — 16 call sites (`ConfirmSubmit`, admin/coach/clips/privacy forms). Shows "fittin.be says" in a webview → web tell.
- `navigator.share` / `navigator.clipboard` — Share*, DoorCodeCard, BewaarSheet.
- `navigator.vibrate` — WorkoutFollow rest timer (no-op on iOS).
- `target="_blank"` — 22 files (legal pages, receipts, Instagram, exercise sources).
- `localStorage` — theme, dismiss flags (non-critical; fine).
- Service worker — must not be relied on in WKWebView (playbook §2 Mode C).

## Risks for a native build

1. **Google OAuth in a webview** is blocked by Google (`disallowed_useragent`), and the Supabase host is not in the app's navigation allow-list, so the current redirect flow would bounce to Safari. → needs an app-specific flow (ASWebAuthenticationSession / Custom Tabs + custom-scheme callback).
2. **Stripe Checkout** navigates to `checkout.stripe.com`; must be allowed in the webview or the payment happens in Safari.
3. **Guideline 4.2** — a site in a box is rejected; native tab bar, push, door, haptics, deep links, offline screen must be real.
4. **Apple 5.1.1(v)** — deletion is currently a *request* handled by the admin within 30 days (legal 7-year invoice retention). Apple accepts this when it is initiated in-app and clearly states the timeline; it must be easy to find.
5. **Apple 4.8** — if Google login is offered in the iOS app, Sign in with Apple must be offered too.
6. **Server/binary skew** — the site redeploys independently of the binary: every plugin call must be feature-detected.
7. `h-screen` / `min-h-screen` in 30 files — acceptable in a document-scrolling site (WKWebView reports a stable `vh` with `viewport-fit=cover`), not changed.
