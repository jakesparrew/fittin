-- 0127 — Onthoud welke client-fouten al per mail gemeld zijn.
--
-- Les van 5-6 augustus: Laura's "Can't find variable: sess" stond vanaf 21:23 in client_errors,
-- gegroepeerd zichtbaar op /beheer/meldingen — en niemand keek tot ze zelf mailde, een halve dag
-- later. Een foutenlijst is een archief; een mail is een alarm. De 5-minutencron mailt voortaan
-- bij elke NIEUWE app-fout (netwerkruis en browserextensie-gerommel niet — zie lib/error-triage).
--
-- alerted_at voorkomt dubbele mails: één alarm per fout-groep (zelfde melding + pagina), niet één
-- per voorval. Komt dezelfde fout later terug na een "✓ Opgelost", dan is dat een nieuwe rij met
-- alerted_at NULL en gaat het alarm opnieuw af — precies wat je wil.
alter table client_errors add column if not exists alerted_at timestamptz;

create index if not exists client_errors_unalerted_idx
  on client_errors (created_at desc) where alerted_at is null and resolved_at is null;
