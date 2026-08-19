-- 0141: migratieledger.
--
-- WAAROM: tot nu toe hield niets bij welke migratie gedraaid was. Of 0132/0133/0137/0138/0139
-- toegepast waren, viel alleen af te leiden uit de objecten zelf — `select
-- to_regclass('supabase_migrations.schema_migrations')` gaf null, en in information_schema stonden
-- enkel de ledgers van Supabase zelf (realtime, auth, storage), niets voor onze eigen bestanden.
--
-- Waarom dat gevaarlijk is en niet enkel slordig: 0138 bevat een datamigratie
-- (`update exercises set updated_at = created_at where updated_at > created_at`). Wie dat bestand
-- per ongeluk een tweede keer draait nadat er oefeningen bewerkt zijn, gooit de echte
-- wijzigingsdatums weg — en daarmee de <lastmod> in de sitemap, precies het signaal waarvoor die
-- kolom is aangelegd. Zonder ledger is "is deze al gedraaid?" een geheugenkwestie.
--
-- Deze tabel is voortaan de waarheid: scripts/migrate-mgmt.mjs schrijft elke gedraaide bestandsnaam
-- weg en weigert wat er al in staat. Deze migratie raakt GEEN bestaand object aan — ze legt de
-- ledger aan en boekt de 136 bestanden in die op 19-08-2026 in supabase/migrations/ stonden. Ze
-- opnieuw draaien is zinloos maar onschadelijk: alles hieronder is idempotent.

create table if not exists public.schema_migrations (
  version     text primary key,  -- bestandsnaam, exact zoals in supabase/migrations/
  checksum    text,              -- sha256 van de inhoud op het moment van draaien
  applied_at  timestamptz,       -- null = retroactief ingeboekt (zie hieronder)
  recorded_at timestamptz not null default now()
);

comment on table public.schema_migrations is
  'Welke migratiebestanden gedraaid zijn. Gevuld door scripts/migrate-mgmt.mjs; met de hand aanvullen mag, met de hand verwijderen betekent dat het bestand opnieuw zal draaien.';
comment on column public.schema_migrations.applied_at is
  'null = ingeboekt door de backfill in 0141: de migratie is gedraaid, maar de datum is niet meer te achterhalen.';

-- Alleen de service-role heeft hier iets te zoeken. Supabase deelt op elke nieuwe tabel in public
-- standaard rechten uit aan anon en authenticated (dezelfde valstrik als bij de pv_-functies, zie
-- 0142). RLS zonder policies blokkeert het lezen al, maar we trekken het recht óók expliciet in:
-- anders zet één latere `disable row level security` de deur meteen weer open.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

-- Backfill. Deze bestanden zijn gedraaid — de app draait erop. De staart is nagemeten in plaats van
-- aangenomen: 0138 (exercises.updated_at bestaat), 0139/0140 (member_engagement staat op
-- security_invoker en anon heeft er geen select meer op). applied_at blijft bewust null: doen alsof
-- ze vandaag toegepast zijn, zou een verzonnen datum zijn.
-- De nummers 0134-0136 ontbreken: die bestanden hebben nooit bestaan.
insert into public.schema_migrations (version) values
  ('0001_init.sql'),
  ('0002_seed.sql'),
  ('0003_admin.sql'),
  ('0004_community.sql'),
  ('0005_door.sql'),
  ('0006_pt.sql'),
  ('0007_packages.sql'),
  ('0008_billing.sql'),
  ('0009_welcome.sql'),
  ('0010_coach.sql'),
  ('0011_coach_clients.sql'),
  ('0012_payments.sql'),
  ('0013_newsletter.sql'),
  ('0014_activation.sql'),
  ('0015_lock_profile_columns.sql'),
  ('0016_referral_discounts.sql'),
  ('0017_buddies.sql'),
  ('0018_pending_referral.sql'),
  ('0019_inbox.sql'),
  ('0020_security_hardening.sql'),
  ('0021_referral_paid_discount_binding.sql'),
  ('0022_unpaid_expiry.sql'),
  ('0023_booking_invites.sql'),
  ('0024_coach_refund_cancel_window.sql'),
  ('0025_admin_booking_credit.sql'),
  ('0026_coach_requests_reminders.sql'),
  ('0027_remove_participant.sql'),
  ('0028_invoice_fields.sql'),
  ('0029_coach_exercises.sql'),
  ('0030_sent_emails.sql'),
  ('0031_events_approval.sql'),
  ('0032_coach_payments.sql'),
  ('0033_price_duration.sql'),
  ('0034_notifications.sql'),
  ('0035_buddy_join.sql'),
  ('0036_coach_profiles.sql'),
  ('0037_member_price.sql'),
  ('0038_body_metrics.sql'),
  ('0039_rename_service.sql'),
  ('0040_coach_activity.sql'),
  ('0041_coach_photos_bucket.sql'),
  ('0042_coach_messages.sql'),
  ('0043_multi_hour.sql'),
  ('0044_coach_commissions.sql'),
  ('0045_affiliate_clicks.sql'),
  ('0046_expiry_notify.sql'),
  ('0047_event_rich.sql'),
  ('0048_coach_pt_price.sql'),
  ('0049_coach_credits.sql'),
  ('0050_pt_coach_price.sql'),
  ('0051_referral_rewards.sql'),
  ('0052_social_feed.sql'),
  ('0053_feed_backfill.sql'),
  ('0054_perf_indexes.sql'),
  ('0055_security_booking_payment_hardening.sql'),
  ('0056_role_boundary_hardening.sql'),
  ('0057_data_integrity.sql'),
  ('0058_payments_challenges.sql'),
  ('0059_perf_credits_gym_index.sql'),
  ('0060_rich_exercises.sql'),
  ('0061_exercise_frames.sql'),
  ('0062_member_plans.sql'),
  ('0063_member_plans_hardening.sql'),
  ('0064_plan_atomic_ordinals.sql'),
  ('0065_pricing_2026.sql'),
  ('0066_no_duration_discount.sql'),
  ('0067_leaderboard_optin.sql'),
  ('0068_email_invites.sql'),
  ('0069_welcome_access_reschedule.sql'),
  ('0070_reset_2026.sql'),
  ('0071_public_workouts.sql'),
  ('0072_admin_set_role_text.sql'),
  ('0073_coach_pt_tiers.sql'),
  ('0074_pt_price_per_formule.sql'),
  ('0075_halfhour_slots.sql'),
  ('0076_halfhour_planners.sql'),
  ('0077_taken_slots_robust.sql'),
  ('0078_nuki_keypad.sql'),
  ('0079_reschedule_clear_nuki.sql'),
  ('0080_discount_amount.sql'),
  ('0081_security_hardening.sql'),
  ('0082_page_views.sql'),
  ('0083_coach_connect.sql'),
  ('0084_launch_hardening.sql'),
  ('0086_coach_reschedule_freehours.sql'),
  ('0087_coach_reserve_slot.sql'),
  ('0088_admin_reschedule_booking.sql'),
  ('0089_unpaid_hold_align.sql'),
  ('0090_coach_credits_allow_negative.sql'),
  ('0091_payment_receipt_url.sql'),
  ('0092_coach_billing_details.sql'),
  ('0093_invoice_no_owner.sql'),
  ('0094_staff_self_coach.sql'),
  ('0095_credit_balance_fifo.sql'),
  ('0096_unpaid_hold_restore.sql'),
  ('0097_refund_coach_client_credit.sql'),
  ('0098_beheerder_only_write_policies.sql'),
  ('0099_door_log_index.sql'),
  ('0100_credit_expiry_detail.sql'),
  ('0101_site_events.sql'),
  ('0102_gym_secrets.sql'),
  ('0103_client_errors.sql'),
  ('0104_lifecycle_markers.sql'),
  ('0105_slot_waitlist.sql'),
  ('0106_sent_emails.sql'),
  ('0107_cron_runs.sql'),
  ('0108_message_read_state.sql'),
  ('0109_coach_client_notes.sql'),
  ('0110_booking_series.sql'),
  ('0111_program_exercise_rich.sql'),
  ('0112_workout_feedback.sql'),
  ('0113_problem_reports.sql'),
  ('0114_coach_member_rate.sql'),
  ('0115_coach_credit_guard.sql'),
  ('0116_coach_invoice_fix.sql'),
  ('0117_halfhour_sessions.sql'),
  ('0118_halfhour_hardening.sql'),
  ('0119_comp_booking_reason.sql'),
  ('0120_drop_balie_mode.sql'),
  ('0121_shorter_hold.sql'),
  ('0122_lock_battery_alert.sql'),
  ('0123_client_errors_resolve.sql'),
  ('0124_coach_invoice_guard.sql'),
  ('0125_legal_consents.sql'),
  ('0126_data_rights.sql'),
  ('0127_error_alerting.sql'),
  ('0128_no_invoice_bookings.sql'),
  ('0129_test_accounts.sql'),
  ('0130_insight_snoozes.sql'),
  ('0131_exercise_loop.sql'),
  ('0132_write_grants_hardening.sql'),
  ('0133_refund_after_start.sql'),
  ('0137_meten.sql'),
  ('0138_content_updated_at.sql'),
  ('0139_hygiene.sql'),
  ('0140_member_engagement_lek.sql')
on conflict (version) do nothing;
