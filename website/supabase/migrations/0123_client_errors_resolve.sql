-- 0123 — Foutlogs kunnen afsluiten.
--
-- PROBLEEM (owner): "ze verdwijnen niet". De lijst toonde alles van de laatste 7 dagen zonder
-- enige manier om iets af te vinken, dus een fout die allang gerepareerd was bleef even hard
-- schreeuwen als een nieuwe. Daardoor wordt de hele lijst genegeerd — precies het tegenovergestelde
-- van waarvoor ze bedoeld is.
--
-- Oplossing: per rij een resolved_at. "Opgelost" markeert alle bestaande voorvallen van datzelfde
-- soort fout; gebeurt hij daarna opnieuw, dan komt hij als nieuwe (onopgeloste) rij binnen en
-- verschijnt hij vanzelf terug. Zo is de lijst een signaal in plaats van een kerkhof.
alter table client_errors add column if not exists resolved_at timestamptz;

comment on column client_errors.resolved_at is
  'Wanneer een beheerder deze fout als afgehandeld markeerde. NULL = nog open. Nieuwe voorvallen na dat moment komen opnieuw binnen als open.';

-- De meldingenpagina vraagt vrijwel altijd "recent én nog open" op.
create index if not exists client_errors_open_idx
  on client_errors (created_at desc) where resolved_at is null;
