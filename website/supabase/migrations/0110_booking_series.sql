-- Coach recurring bookings: tag every session created in one "reeks" with a shared series_id so the
-- coach can cancel the whole future series at once. Additive + nullable (single bookings stay null).

alter table bookings add column if not exists series_id uuid;
create index if not exists bookings_series_idx on bookings(series_id) where series_id is not null;
