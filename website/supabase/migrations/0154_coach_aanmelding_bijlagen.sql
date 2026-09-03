-- 0154 — Een coach die zich aanmeldt mag optioneel een cv (pdf) en een foto meesturen.
--
-- Waarom een eigen, PRIVATE bak: een cv bevat een adres, een geboortedatum en soms een
-- rijksregisternummer. De drie bestaande bakken (coach-photos, event-images, feed-images) zijn
-- publiek; daar hoort dit niet in. De beheerpagina toont de bestanden via een ondertekende link
-- die vanzelf verloopt, net zoals de meldingsfoto's uit 0150.
--
-- Waarom een aparte tabel en niet gewoon een pad in de inbox-tekst: de bijlagen horen bij één
-- aanmelding, er kunnen er twee zijn, en de beheerinbox moet ze als aanklikbare bestanden kunnen
-- tonen. Een pad in een tekstveld zou dat allemaal moeten raden.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-aanmeldingen', 'coach-aanmeldingen', false, 8388608,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Alleen personeel leest de bak. Schrijven gebeurt uitsluitend met de service-role vanaf de
-- server: de kandidaat heeft geen account en uploadt dus via de server action, nooit rechtstreeks.
drop policy if exists coach_aanmeldingen_staff_select on storage.objects;
create policy coach_aanmeldingen_staff_select on storage.objects for select
  using (bucket_id = 'coach-aanmeldingen' and public.is_staff());

create table if not exists public.coach_application_files (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  -- De aanmelding zelf leeft als bericht in de beheerinbox; wordt die gearchiveerd of gewist,
  -- dan verdwijnen deze rijen mee. Het bestand in de bak blijft dan wees — bewust: een cv
  -- automatisch wissen op basis van een archiefknop is een gegevensverlies dat niemand vroeg.
  inbound_email_id  uuid references public.inbound_emails(id) on delete cascade,
  soort             text not null check (soort in ('cv', 'foto')),
  pad               text not null,
  bestandsnaam      text,
  mime              text,
  bytes             int,
  created_at        timestamptz not null default now()
);
create index if not exists coach_application_files_mail_idx on public.coach_application_files (inbound_email_id);

alter table public.coach_application_files enable row level security;
drop policy if exists coach_application_files_staff on public.coach_application_files;
create policy coach_application_files_staff on public.coach_application_files for select
  using (gym_id = current_gym_id() and is_staff());
revoke all on public.coach_application_files from public, anon, authenticated;
grant select on public.coach_application_files to authenticated;
grant select, insert, delete on public.coach_application_files to service_role;
