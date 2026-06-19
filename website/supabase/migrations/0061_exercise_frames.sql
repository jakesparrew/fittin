-- 0061: support a multi-frame "moving image" demo per exercise + import metadata.
-- frames = ordered image URLs (e.g. start/end of the movement) cycled into a looping demo.
-- Lets us populate a full library from the public-domain free-exercise-db (rehostable later).
alter table exercises add column if not exists frames   text[];
alter table exercises add column if not exists mechanic text;             -- compound | isolation
alter table exercises add column if not exists force    text;             -- push | pull | static
alter table exercises add column if not exists source   text default 'gym'; -- 'gym' | 'free-exercise-db'
