-- W2 — richer per-exercise prescriptions for coaches. Additive & nullable; existing programs keep
-- rendering unchanged (all new fields null). tempo + notes already exist on program_exercises.

alter table program_exercises add column if not exists target_weight_kg numeric;  -- streefgewicht
alter table program_exercises add column if not exists rpe smallint;               -- doel-RPE (1-10)
alter table program_exercises add column if not exists superset_group smallint;    -- zelfde nr = superset
alter table program_exercises add column if not exists superset_order smallint;    -- volgorde binnen de superset
