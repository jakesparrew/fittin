-- 0168 — Sessie-ervaring: drie antwoorden in plaats van vijf sterren, met redenen.
-- Wat betekent een 4 of een 2? Niemand weet het. Nu: Top (5) · Oké (3) · Niet goed (1) — dezelfde kolom `rating`, zodat
-- oude sterren vergelijkbaar blijven — plus WAAROM, als vaste keuzes (lib/ervaring.js).
alter table public.session_feedback add column if not exists redenen text[] not null default '{}';
