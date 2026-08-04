-- 0122 — Onthoud tot welk niveau er al gewaarschuwd is over de slotbatterij.
--
-- Zonder geheugen zou de dagelijkse controle élke dag opnieuw dezelfde mail sturen zodra de
-- batterij onder de drempel zakt. Na drie dagen leest niemand dat nog, en dan mist men net de
-- waarschuwing die telt. Daarom getrapt: één mail per drempel (30 / 20 / 10 / kritiek).
--
-- battery_alert_tier bevat het LAAGSTE percentage waarvoor al gemaild is (0 = kritiek gemeld,
-- NULL = nog niets gemeld). Zodra de batterijen vervangen zijn en het niveau weer boven de
-- hoogste drempel komt, wordt de kolom teruggezet zodat de reeks opnieuw kan lopen.
alter table gym_integrations add column if not exists battery_alert_tier int;

comment on column gym_integrations.battery_alert_tier is
  'Laagste batterijdrempel (%) waarvoor al een waarschuwing verstuurd is; 0 = kritiek, NULL = geen. Reset zodra de batterij weer boven de hoogste drempel komt.';

-- Laatste meting bewaren zodat het beheerdashboard het batterijniveau kan tonen zonder bij elke
-- pageload de Nuki-API te bevragen (traag, en nodeloos veel calls). Met de meetdatum erbij, want
-- "60%" zonder te weten of dat van vandaag of van vorige maand is, is geen informatie.
alter table gym_integrations add column if not exists battery_pct int;
alter table gym_integrations add column if not exists battery_keypad_critical boolean not null default false;
alter table gym_integrations add column if not exists battery_checked_at timestamptz;
