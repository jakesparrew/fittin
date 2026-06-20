# Security audit — fittin.be (2026-06-20)

Adversarial multi-agent audit across auth/RLS, payments, booking + physical door, API/cron/webhooks,
input/XSS/uploads, secrets/config. 30 findings; 10 High verified, no true Criticals.

## ✅ Fixed (commit follows) — migration 0081 + code

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| HIGH-1 | High | Door + auto-minted Nuki code granted to **unpaid** bookings | `open_door()` now requires `paid OR payment_source<>'los'`; `sendDueAccessCodes` filters the same. |
| HIGH-6 | High | Coach self-grants gym credits (`coach_ledger`) | Revoked all anon/authenticated writes; only SECURITY DEFINER RPCs + service-role webhook write. |
| HIGH-7 | High | Coach mints member credits (`credits_ledger`) | Same revoke. |
| HIGH-8 | High | Coach creates 100%-off discount code | `discount_codes` write policy → `is_beheerder()`; discount actions → `requireStaff(true)`. |
| MED-1 | Med | Coach fabricates active membership | Revoked direct writes on `memberships` (+ `punch_cards`). |
| HIGH-5 | High | Webhook treats `completed` as paid (delayed methods) | Grant only when `payment_status==='paid'`; added `async_payment_succeeded` handler. |
| MED-6 | Med | Booking marked paid without amount check | `markBookingPaid` requires `amount_total >= charge`. |
| HIGH-9 | High | SVG/HTML upload → stored XSS on *.supabase.co | Uploads now allow only JPG/PNG/WebP/GIF; SVG rejected (coach photo, feed, events). |

## ⏳ Pending (next)

| ID | Severity | Issue | Plan |
|----|----------|-------|------|
| HIGH-2/3 | High | `gyms` is world-readable (`select using(true)`) → `access_code` / IBAN / VAT / invoice_email exposed to anon | **Currently not exploitable: `access_code` and `iban` are both NULL.** Fix: move sensitive columns off `gyms` (or column-level grants + a public-safe view) and refactor `select('*')` gym reads. ⚠️ Until then, do NOT set a static `access_code` or `iban` in Instellingen. |
| HIGH-4 | High | Plaintext secrets on disk (`.env.local`, `.env.live`, `.vercel/...`) | Owner action: **rotate all secrets** (service-role, Stripe, Resend, Supabase PAT, Vercel token, CRON_SECRET, Nuki). Delete `.env.live`. Keep prod secrets only in Vercel. |
| HIGH-10 | Med | HTML/email injection via unescaped `full_name` etc. | Add `escapeHtml` helper, wrap every user value in `lib/email.js` + newsletter; cap `full_name` at signup. |
| MED-2/3/4/5 | Med | More `is_staff()` write policies (coach_clients, subscribers/campaigns, services/packages/challenges/events/slot_blocks, gyms_update) should be `is_beheerder()` | One migration tightening each + a regression test that a coach JWT is denied writes. |
| MED-7 | Med | Refund auto-reversal not spend-aware | Reverse only unspent remainder; never negative; don't auto-cancel past slots. |
| MED-8 | Med | `CRON_SECRET` sent in URL by `kickWorker` | Send in `Authorization` header. |
| MED-9 | Med | Newsletter `body_html` rendered with `dangerouslySetInnerHTML` (staff-to-staff XSS) | Sanitize (DOMPurify) or sandbox iframe like the inbox viewer. |
| MED-10 | Med | No HSTS, weak CSP | Add HSTS + a real `script-src`/`connect-src` CSP (report-only first). |
| LOW-1..8 | Low | referral input validation, webhook lock-on-error, timing-safe compare, inbound id encoding, verbose webhook error, coachInviteByEmail rate limit, next/image remotePatterns pin | Batch later. |

## Root cause
Most coach-escalation findings share one cause (**MED-5**): RLS write policies were left at `is_staff()` while the app enforces beheerder-only only at the action layer. The real fix is to make RLS the authoritative boundary — done for the money tables in 0081, remaining tables next.
