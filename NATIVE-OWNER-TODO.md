# Native app — what only the owner can provide

Everything here is needed before (or to finish) the App Store / Play submission. Nothing in this
list goes into git except where marked "public". Secrets → Vercel env vars or `website/.secrets/`
(gitignored).

Legend: ⛔ blocks submission · ⚙️ unlocks a feature (app works without it) · 📄 store form

## What's left, in order

1. ⛔ **Commit and deploy the website.** The app is a shell around `https://fittin.be/app`
   (docs/native/01-decision.md): the welcome screen, safe areas, native tab bar, dialogs, push —
   all of it lives in the site. Until the site is deployed, a production build of the app shows
   a 404 on `/app` and the plain website everywhere else. Deploy = push `main` (Vercel).
2. ⚙️ Apply migration `0163_push_tokens` (below).
3. ⛔ Apple Developer + App Store Connect, Google Play (below).
4. ⚙️ Push keys, Sign in with Apple, Google redirect URL → `NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN=1`.
5. 📄 Store listing, screenshots, privacy label, review notes (docs/native/store-review.md).
6. ⛔ Test on real devices: log in, book + pay, open the door, receive a push, open a
   fittin.be link from Messages. None of that could be tested here (no Supabase keys locally,
   no signing, no push keys).
7. Build, sign and upload (docs/native/release-runbook.md).

Local development: `npm run ios:dev` / `npm run android:dev` start the dev server themselves.
A dev build points at the laptop — run `npm run cap:sync` before building against fittin.be.
Local `.env.local` has only the public Supabase keys of the **production** database: login works,
accounts created locally are real, payments/mail/door don't work locally (no secrets on the Mac).
See docs/native/release-runbook.md → "Local keys".

## Database

- ⚙️ **Apply migration `website/supabase/migrations/0163_push_tokens.sql`** to production
  (`node scripts/migrate.mjs` or the Supabase SQL editor). Until then the app runs fine; push
  registration just logs and does nothing.

## Apple (developer.apple.com — €99/yr)

- ⛔ **Apple Developer account** (organisation = De Wereld Draait Door VZW needs a D-U-N-S number).
- ⛔ **Team ID** → Vercel env `APPLE_TEAM_ID` (serves `/.well-known/apple-app-site-association`)
  and Xcode → Signing & Capabilities → Team.
- ⛔ **App ID `be.fittin.app`** with capabilities: Push Notifications, Sign in with Apple,
  Associated Domains. (Automatic signing creates it; check the portal.)
- ⚙️ **APNs Auth Key (.p8)** + Key ID → Vercel env `APNS_KEY_P8` (full file contents),
  `APNS_KEY_ID`, `APPLE_TEAM_ID`. Without it, iOS push is silently off.
- ⚙️ **Sign in with Apple in Supabase:** Dashboard → Authentication → Providers → Apple → enable,
  add `be.fittin.app` to *Client IDs*. Native iOS needs no secret key.

## App Store Connect

- 📄 App record: name (≤30, suggestion "Fittin' — privégym Gent"), bundle `be.fittin.app`,
  SKU `fittin-ios`, primary language Dutch.
- 📄 Category Health & Fitness; age-rating questionnaire (no UGC beyond the community feed →
  answer the UGC questions honestly; report/block exists in the feed).
- 📄 App Privacy label — must match `ios/App/App/PrivacyInfo.xcprivacy` (see docs/native).
- 📄 Screenshots 6.9" (1320×2868), support URL `https://fittin.be/hulp`,
  privacy URL `https://fittin.be/privacy`.
- ⛔ **Review demo account** (e-mail + password, no 2FA) with credits so the reviewer can book,
  and a note that the door cannot be opened remotely outside a booked slot.
- 📄 Export compliance: already answered in Info.plist (`ITSAppUsesNonExemptEncryption = NO`).

## Google / Firebase / Play

- ⛔ **Play Console account** (€25). Organisation account avoids the 12 testers × 14 days rule.
- ⛔ **Upload keystore** → keep in a password manager + `website/.secrets/upload.keystore`,
  passwords in `website/android/keystore.properties` (gitignored).
- ⚙️ **Firebase project** → Android app `be.fittin.app` → `google-services.json` into
  `website/android/app/` (public identifier, may be committed). Without it Android push stays off.
- ⚙️ **FCM service-account JSON** → Vercel env `FCM_SERVICE_ACCOUNT_JSON`.
- ⚙️ **SHA-256 fingerprints** (Play App Signing + upload + debug) → Vercel env
  `ANDROID_CERT_SHA256` (comma-separated) for `/.well-known/assetlinks.json`.
- 📄 Store listing, Data safety form, content rating, target audience, ads = none,
  **account-deletion URL `https://fittin.be/account-verwijderen`** (public page, added).

## Google sign-in inside the app

- ⚙️ Supabase → Authentication → URL Configuration → *Redirect URLs*: add
  `be.fittin.app://auth/callback` (the app's OAuth return). No new Google client needed — it
  reuses the existing Supabase Google provider.
- ⚙️ Then set Vercel env `NEXT_PUBLIC_NATIVE_SOCIAL_LOGIN=1` and redeploy. This turns on
  Google (iOS + Android) **and** Apple (iOS) together — Apple 4.8 requires both or neither.

## Decisions for the owner

- **Account deletion** is a request processed within 30 days (legal invoice retention). It is
  reachable in-app (Account → Je gegevens) and states the timeline, which Apple accepts. If a
  reviewer pushes back, the fallback is automatic anonymisation after confirmation.
- **Store name**: "Fittin'" alone may be taken; suggestion "Fittin' — privégym Gent".
- **Force update**: set Vercel env `APP_MIN_BUILD` to a build number to block older binaries.
