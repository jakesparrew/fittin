-- 🔴 DATALEK: de view member_engagement was met de PUBLIEKE anon-sleutel volledig uit te lezen —
-- naam, e-mailadres, tegoed, bezoekgeschiedenis en abonnementsstatus van elk lid.
--
-- Nagemeten vóór deze migratie, met enkel NEXT_PUBLIC_SUPABASE_ANON_KEY (de sleutel die in élke
-- browser zit): `select full_name, email, credits from member_engagement` gaf 66 rijen terug.
-- Dezelfde sleutel op profiles, bookings en payments gaf correct 0 rijen — RLS doet daar zijn werk.
--
-- Waarom de view wél lekte: een view draait standaard met de rechten van zijn EIGENAAR (postgres),
-- niet van de aanroeper. Daardoor wordt de RLS op profiles niet toegepast. Migratie 0139 herschreef
-- deze view en nam die eigenschap ongewijzigd over; het commentaar daar ("wordt uitsluitend gelezen
-- door lib/activation.js via de service-role") beschreef het BEDOELDE gebruik, niet wat er mogelijk was.
--
-- Twee lagen, want één ervan kan later per ongeluk teruggedraaid worden:
--   1. security_invoker: de view volgt voortaan de rechten van wie hem leest, dus RLS op profiles
--      geldt weer. De service-role omzeilt RLS sowieso, dus lib/activation.js blijft werken.
--   2. Het leesrecht zelf intrekken. Geen enkele plek in de app leest deze view met de
--      gebruikersclient — enkel `admin.from("member_engagement")` in lib/activation.js:62.
alter view public.member_engagement set (security_invoker = on);
revoke select on public.member_engagement from anon, authenticated;
