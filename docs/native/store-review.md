# Store review — notes, privacy label, Data safety

## App Review notes (paste into App Store Connect → App Review Information)

> Fittin' is a private gym in Ghent (Belgium). Members book the entire gym by the hour and open
> the door with the app during their booked slot. Payments are for a real-world service (gym time,
> personal training) and use Stripe, per guideline 3.1.3(e).
>
> **Demo account:** (e-mail / password — see the fields above). The account has session credits,
> so you can complete a booking without paying.
>
> **Native features, and where to find them:**
> - Native tab bar (Boeken · Workouts · Training · Oefeningen · Account), role-aware.
> - Push notifications: Account → "Meldingen aanzetten" (asked in context, never at launch). A
>   coach message or booking change arrives as a push.
> - Door unlock with haptic confirmation: Account → "Open de deur" (works only during a booked
>   slot; outside it you'll see a polite refusal — that is expected).
> - Native share sheet: Community → "Deel je link", any workout → Deel.
> - Native confirmation dialogs, in-app Safari for external links, edge-swipe back.
> - Offline screen when there is no connection; universal links from fittin.be open the app.
> - Sign in with Apple (when Google sign-in is offered, Apple is offered too).
>
> **Account deletion:** Account → Je gegevens → "Verwijdering aanvragen". Because invoices must
> legally be kept for 7 years, deletion of the profile and personal data is completed within 30
> days and confirmed by e-mail; the app says so before the request is sent. Public page:
> https://fittin.be/account-verwijderen

## App Privacy label (must match ios/App/App/PrivacyInfo.xcprivacy)

Tracking: **No**. No third-party advertising or analytics SDKs.

| Data type | Linked to user | Purpose |
| --- | --- | --- |
| Name, Email address, Phone number | Yes | App functionality |
| Fitness (workouts, sets) | Yes | App functionality |
| Health (body weight, height — only with explicit consent) | Yes | App functionality |
| Purchase history | Yes | App functionality |
| User ID | Yes | App functionality |
| Device ID (push token) | Yes | App functionality |
| Other user content (feed posts, messages to coach) | Yes | App functionality |
| Product interaction (first-party page views) | No | Analytics |
| Crash data (client error log) | No | App functionality |

## Google Play Data safety

Same data as above; all encrypted in transit; users can request deletion (URL above); no data
shared with third parties except processors (Supabase — hosting, Stripe — payments, Resend — e-mail,
Google FCM / Apple APNs — push delivery).

## Store listing text (Dutch)

- **Subtitle (≤30):** Privégym in Gent — boek je uur
- **Short description (Play, ≤80):** Boek de hele zaal, open de deur met je telefoon en train met je coach.
- **Keywords (≤100):** gym,gent,fitness,privé,personal training,boeken,coach,workout,sportschool,training
