-- 0161 — Wat kwam er uit die aanroep?
--
-- WAAROM DEZE KOLOM. `boekVerbruik` boekt VÓÓR bekend is of er iets uitkwam: in maakPlan staat de
-- boeking op regel 126, `leesJson` op 129 en `keurVoorschriften` op 159. De kolom `ok` betekent
-- daardoor uitsluitend "de gateway antwoordde met tekst" — niet "het lid heeft er iets aan".
--
-- Wat dat op productie oplevert: er staan drie plan-aanroepen, alle drie `ok = true`, samen 98.460
-- micro-USD. Er is één coaching_plans-rij, aangemaakt één seconde na de derde aanroep. Twee van de
-- drie leverden dus niets op — 71.030 micro, 72% van alles wat de coach ooit gekost heeft — en de
-- beheerpagina toonde daarbij "Mislukt: 0". Een logboek dat die leugen herhaalt is erger dan geen
-- logboek, want het wekt vertrouwen dat er niet is.
--
-- Vrije tekst en geen enum: de uitgangspunten van een aanroep veranderen sneller dan een type.
-- Waarden die de code vandaag schrijft staan in lib/coaching/budget.js (GELEVERD) en zijn o.a.
-- plan_geschreven, zin_geschreven, menu_geschreven, gateway_faalde, json_onleesbaar,
-- geen_oefeningen, afgekeurd, opslag_faalde.
--
-- GEEN BACKFILL. De drie bestaande rijen krijgen null en worden getoond als "van vóór dit logboek —
-- resultaat onbekend". Achteraf raden welke van de drie het plan opleverde is precies de tijdsgok
-- waar deze kolom een eind aan maakt.

alter table public.coaching_verbruik add column if not exists resultaat text;

-- 0157 gaf service_role alleen select + insert op deze tabel. Een nieuwe kolom erft GEEN
-- kolomrechten — dezelfde les als 0152 en 0157. Zonder deze grant faalt `boekResultaat` stil (hij
-- is best-effort en logt alleen naar de console), en staat élke aanroep voorgoed op "onbekend"
-- terwijl het logboek er betrouwbaar uitziet.
grant update (resultaat) on public.coaching_verbruik to service_role;
