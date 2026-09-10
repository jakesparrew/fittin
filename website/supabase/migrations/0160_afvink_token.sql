-- 0160 — Een eigen sleutel voor het afvinken, los van het meldtoken.
--
-- WAAROM. Bij het uitrollen van "afvinken vanuit de deurcodemail" (0159-ronde) leunde /s/{token}
-- op `bookings.report_token`. Dat leek zuinig: die token bestond al, zat al in diezelfde mail en
-- had al de juiste levensduur. De redenering was dat de coach geen afvinklinks kán hebben omdat
-- zijn kopie van de deurcodemail geen workoutblok bevat.
--
-- Die redenering was fout, en een adversariële audit heeft hem omgekeerd. Bij een coach-sessie
-- krijgt de COACH dezelfde mail met dezelfde `report_token`, want de meldpuntlink `/m/{token}`
-- staat in beide kopieën. Hij hoefde alleen `/m/` door `/s/` te vervangen om de sessie van zijn
-- client af te vinken — en dat oordeel stuurt de progressie van iemand anders.
--
-- Het echte lek was dus niet de opmaak van de mail maar het feit dat één sleutel twee bevoegdheden
-- droeg. Een sleutel hoort bij één handeling. Deze staat op de SESSIE (niet op de boeking), wordt
-- alleen in het workoutblok gerenderd, en dat blok bestaat per constructie alleen in de mail van
-- het lid. Nu is dat wél een constructie in plaats van een bewering.
--
-- Lui aangemaakt op het moment dat de deurcodemail vertrekt (zie lib/coaching/levering.js), net
-- als het meldtoken. Sessies die nooit een deurcodemail krijgen, krijgen ook nooit een token.

alter table public.coaching_sessions add column if not exists afvink_token text;

-- Uniek zodat een token nooit twee sessies kan aanwijzen. Partieel, want de overgrote meerderheid
-- van de rijen heeft er geen en NULL's hoeven niet in de index.
create unique index if not exists coaching_sessions_afvink_token
  on public.coaching_sessions (afvink_token) where afvink_token is not null;

-- Een nieuwe kolom erft geen kolomrechten (zie 0157 en 0158). Bewust GEEN select voor
-- `authenticated`: een lid heeft de token nooit nodig in de app — hij komt er via zijn mail, en
-- daar zet de service-role hem in. Wie hem wel zou kunnen lezen, kan er ook niets extra's mee,
-- maar een sleutel die nergens gelezen hoeft te worden, geef je ook nergens vrij.
grant select (afvink_token), update (afvink_token) on public.coaching_sessions to service_role;
