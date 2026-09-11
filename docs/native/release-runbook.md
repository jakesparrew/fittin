# Native app — release runbook

Everything runs from `website/`. The app is a Capacitor 8 shell that loads `https://fittin.be/app`
(see 01-decision.md), so **most changes ship with a normal Vercel deploy**. A new binary is only
needed for native changes: plugins, icons, Info.plist/manifest, entitlements, Swift/Java.

## Machine

| Tool | Version | Note |
| --- | --- | --- |
| Xcode | 26+ | App Store uploads need the iOS 26 SDK |
| Node | 22+ | |
| JDK | **21** | Homebrew has 25 only, which Gradle 8.14 can't run. Use Android Studio's: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` |
| Android SDK | platform 36 | `export ANDROID_HOME=$HOME/Library/Android/sdk` |

## Everyday

```bash
npm run dev                 # web on :3000
npm run ios:dev             # simulator, live against localhost:3000/app
npm run android:dev         # emulator, live against 10.0.2.2:3000/app
npm run native:assets       # after changing assets/brand/*.svg → then Clean Build Folder in Xcode
```

`capacitor.config.js` refuses to build with `CAPACITOR_SERVER_URL` outside development, so a
release can never point at a laptop.

### Local keys (`website/.env.local`, gitignored)

The Vercel project is `fittin` in team `gaetanjansseune-4744s-projects` (linked in `website/.vercel`).
Its Development environment has no app variables, and the Supabase URL/key are not in the
project's env list at all (they come from a team-level/integration source), so `vercel env pull`
alone gives an empty file. `.env.local` therefore holds only the two **public** browser keys —
the same values fittin.be ships to every visitor:

```
NEXT_PUBLIC_SUPABASE_URL=https://pxzugezhpwmazngkmzvm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
```

⚠️ That is the **production** database. Logging in and browsing work locally; an account you
create locally is real. Everything that needs a server secret does NOT work locally (service-role
admin actions, welcome/transactional mail, Stripe Checkout, the Nuki door) — by design, so a
local test can never charge money or open the door. Test those against fittin.be after a deploy.

## Release

1. **Web first.** Deploy the site (it must stay compatible with every installed binary). New
   plugin calls are always behind `has()` / `capabilities()`.
2. **Version.** Bump `version` in `package.json`, then `npm run native:version`
   (re-upload of the same version: `npm run native:version -- --build <higher number>`).
3. **Sync.** `npx cap sync` (no env vars → production URL).
4. **iOS.**
   ```bash
   xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -destination 'generic/platform=iOS' \
     -archivePath ~/Library/Developer/Xcode/Archives/$(date +%F)/Fittin-$(date +%H%M).xcarchive archive
   ```
   Then Organizer → Distribute App → App Store Connect (or `-exportArchive` with an
   ExportOptions.plist `method = app-store-connect`). TestFlight in 10–30 min.
5. **Android.** `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
   Signing reads `android/keystore.properties` (gitignored). Internal testing → closed → production
   with a staged rollout (10 % → 50 % → 100 %).
6. **Retire old binaries** (only when needed): Vercel env `APP_MIN_BUILD=<build>` → older apps show
   one "update" screen.

## Secrets (locations only — never values)

| Secret | Where |
| --- | --- |
| APNs key (.p8), Key ID | Vercel env `APNS_KEY_P8`, `APNS_KEY_ID`; original in the password manager |
| Apple Team ID | Vercel env `APPLE_TEAM_ID`; Xcode signing |
| FCM service account JSON | Vercel env `FCM_SERVICE_ACCOUNT_JSON` |
| Android upload keystore + passwords | password manager + `website/.secrets/` + `android/keystore.properties` |
| Play / App Signing SHA-256s | Vercel env `ANDROID_CERT_SHA256` (public values) |

## Renewal dates

- Apple Developer membership: yearly.
- APNs auth keys don't expire, but are revoked if the membership lapses.
- Sign in with Apple needs no secret for the native iOS flow (only for web/Android Apple login,
  which this app doesn't offer). Nothing to rotate.

## Verify after every release

- Push: send a test notification from Beheer (any action that creates a bell notification).
- Universal link: open `https://fittin.be/boeken` from Notes/Messages → should open the app.
- `curl -sI https://fittin.be/.well-known/apple-app-site-association` → 200, `application/json`,
  no redirect. Same for `/.well-known/assetlinks.json`.
