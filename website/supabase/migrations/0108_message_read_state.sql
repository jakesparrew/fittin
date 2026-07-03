-- Batch 3.4 — messaging read-state. coach_messages (0042) had no read tracking, so neither side
-- could see unread counts. Additive: mark when the recipient has seen a message.

alter table coach_messages add column if not exists read_at timestamptz;

-- Fast unread lookup per thread ("messages to me that I haven't read yet").
create index if not exists coach_messages_unread_idx on coach_messages(coach_id, client_id) where read_at is null;
