-- 0060: rich exercise library — animated/visual demos, explanations, muscles, equipment.
-- Enriches the thin exercises table (name + muscle + video_url) so the member app can show a
-- demo, target muscles, equipment, difficulty and step-by-step instructions per exercise.

alter table exercises add column if not exists slug              text;
alter table exercises add column if not exists category          text;          -- borst/rug/benen/...
alter table exercises add column if not exists primary_muscles   text[];
alter table exercises add column if not exists secondary_muscles text[];
alter table exercises add column if not exists equipment         text;          -- Barbell/Dumbbell/Machine/Bodyweight/...
alter table exercises add column if not exists difficulty        text;          -- beginner/intermediate/gevorderd
alter table exercises add column if not exists instructions      text[];        -- numbered steps
alter table exercises add column if not exists tips              text;
alter table exercises add column if not exists image_url         text;          -- still thumbnail/poster
alter table exercises add column if not exists animation_url     text;          -- looping GIF/MP4 demo (preferred)

-- Backfill slugs from names; keep going-forward writes setting slug explicitly.
update exercises
  set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
  where slug is null or slug = '';

-- One library entry per (gym, slug). NULL slugs stay distinct, so this never blocks legacy rows.
create unique index if not exists exercises_gym_slug_key on exercises(gym_id, slug);
create index if not exists exercises_gym_category_idx on exercises(gym_id, category);

-- ── Seed a curated common-exercise library (gym-wide, coach_id null) ─────────────────
-- Written explanations + muscles + equipment + difficulty. Media URLs are left empty for the
-- gym/coaches to fill (paste a GIF/MP4/YouTube link); the UI shows a clean placeholder until then.
with g as (select id from gyms where slug = 'fittin' limit 1),
seed(name, slug, category, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips) as (values
  ('Bench press','bench-press','borst', array['Borst'], array['Triceps','Voorste schouder'], 'Barbell','intermediate',
    array['Lig op de bank met je voeten plat op de grond en je schouderbladen ingetrokken.','Pak de stang iets breder dan schouderbreedte.','Laat de stang gecontroleerd zakken tot net boven je borst.','Duw krachtig omhoog tot je armen gestrekt zijn.'],
    'Houd je polsen recht boven je ellebogen en adem uit tijdens het duwen.'),
  ('Incline dumbbell press','incline-dumbbell-press','borst', array['Bovenborst'], array['Triceps','Voorste schouder'], 'Dumbbell','intermediate',
    array['Stel de bank in op 30-45°.','Start met de dumbbells op schouderhoogte.','Duw recht omhoog tot bijna gestrekt.','Laat gecontroleerd zakken.'],
    'Knijp je borst aan in het hoogste punt; laat de dumbbells niet tegen elkaar tikken.'),
  ('Push-up','push-up','borst', array['Borst'], array['Triceps','Core'], 'Bodyweight','beginner',
    array['Handen iets breder dan schouderbreedte, lichaam in één rechte lijn.','Zak tot je borst net boven de grond is.','Duw terug omhoog en span je core aan.'],
    'Knijp je billen en core aan zodat je heupen niet doorzakken.'),
  ('Barbell row','barbell-row','rug', array['Lats','Bovenrug'], array['Biceps','Achterste schouder'], 'Barbell','intermediate',
    array['Buig voorover met rechte rug, knieën licht gebogen.','Pak de stang op schouderbreedte.','Trek de stang naar je onderbuik.','Laat gecontroleerd zakken.'],
    'Houd je rug recht en trek met je ellebogen, niet met je handen.'),
  ('Lat pulldown','lat-pulldown','rug', array['Lats'], array['Biceps','Bovenrug'], 'Machine','beginner',
    array['Pak de stang breder dan schouderbreedte.','Trek de stang naar je bovenborst.','Laat gecontroleerd terug omhoog.'],
    'Begin de beweging vanuit je schouderbladen, niet je armen.'),
  ('Pull-up','pull-up','rug', array['Lats'], array['Biceps','Core'], 'Bodyweight','gevorderd',
    array['Hang met gestrekte armen, handen iets breder dan schouderbreedte.','Trek jezelf op tot je kin boven de stang is.','Laat gecontroleerd zakken.'],
    'Gebruik een elastiek voor ondersteuning als volledige reps nog niet lukken.'),
  ('Seated cable row','seated-cable-row','rug', array['Bovenrug'], array['Lats','Biceps'], 'Cable','beginner',
    array['Zit rechtop met lichte buiging in de knieën.','Trek de handgreep naar je buik.','Knijp je schouderbladen samen.','Laat gecontroleerd terug.'],
    'Houd je romp stil; beweeg niet heen en weer met je rug.'),
  ('Overhead press','overhead-press','schouders', array['Schouders'], array['Triceps','Bovenborst'], 'Barbell','intermediate',
    array['Sta rechtop met de stang op schouderhoogte.','Duw de stang recht boven je hoofd.','Strek je armen volledig.','Laat gecontroleerd zakken tot schouderhoogte.'],
    'Span je core en billen aan zodat je niet achterover leunt.'),
  ('Dumbbell shoulder press','dumbbell-shoulder-press','schouders', array['Schouders'], array['Triceps'], 'Dumbbell','beginner',
    array['Zit of sta met dumbbells op schouderhoogte.','Duw recht omhoog tot bijna gestrekt.','Laat gecontroleerd zakken.'],
    'Houd je polsen recht boven je ellebogen.'),
  ('Lateral raise','lateral-raise','schouders', array['Zijkant schouder'], array[]::text[], 'Dumbbell','beginner',
    array['Sta met dumbbells naast je lichaam.','Hef je armen zijwaarts tot schouderhoogte.','Laat langzaam zakken.'],
    'Lichte gewichten en strikte vorm werken beter dan zwaar zwaaien.'),
  ('Face pull','face-pull','schouders', array['Achterste schouder'], array['Bovenrug'], 'Cable','beginner',
    array['Stel de kabel in op gezichtshoogte.','Trek het touw naar je gezicht, ellebogen hoog.','Knijp je schouderbladen samen.','Laat gecontroleerd terug.'],
    'Perfect voor een gezonde schouderhouding — focus op controle, niet gewicht.'),
  ('Barbell squat','barbell-squat','benen', array['Quadriceps','Bilspieren'], array['Hamstrings','Core'], 'Barbell','intermediate',
    array['Plaats de stang op je bovenrug, voeten op schouderbreedte.','Zak met rechte rug tot je dijen minstens horizontaal zijn.','Duw door je hielen terug omhoog.'],
    'Houd je knieën in lijn met je tenen en je borst omhoog.'),
  ('Leg press','leg-press','benen', array['Quadriceps','Bilspieren'], array['Hamstrings'], 'Machine','beginner',
    array['Plaats je voeten op schouderbreedte op het platform.','Laat gecontroleerd zakken tot 90°.','Duw terug zonder je knieën te overstrekken.'],
    'Druk door je hielen en hou je onderrug tegen het kussen.'),
  ('Romanian deadlift','romanian-deadlift','benen', array['Hamstrings','Bilspieren'], array['Onderrug'], 'Barbell','intermediate',
    array['Sta met de stang voor je dijen, knieën licht gebogen.','Schuif je heupen naar achter en laat de stang langs je benen zakken.','Voel de rek in je hamstrings.','Kom terug omhoog door je heupen naar voor te duwen.'],
    'Houd de stang dicht bij je lichaam en je rug recht.'),
  ('Walking lunge','walking-lunge','benen', array['Quadriceps','Bilspieren'], array['Hamstrings','Core'], 'Dumbbell','beginner',
    array['Stap naar voor en zak tot beide knieën 90° zijn.','Duw door je voorste hiel omhoog.','Stap door met het andere been.'],
    'Houd je romp rechtop en je voorste knie boven je enkel.'),
  ('Leg curl','leg-curl','benen', array['Hamstrings'], array[]::text[], 'Machine','beginner',
    array['Lig of zit in de machine met je hielen tegen de rol.','Buig je knieën en trek de rol naar je billen.','Laat gecontroleerd terug.'],
    'Vermijd zwaaien; de beweging komt enkel uit je knieën.'),
  ('Biceps curl','biceps-curl','armen', array['Biceps'], array['Onderarm'], 'Dumbbell','beginner',
    array['Sta met dumbbells naast je lichaam, handpalmen naar voor.','Krul de gewichten omhoog naar je schouders.','Laat langzaam zakken tot gestrekt.'],
    'Houd je ellebogen stil naast je lichaam.'),
  ('Triceps pushdown','triceps-pushdown','armen', array['Triceps'], array[]::text[], 'Cable','beginner',
    array['Pak de stang of het touw op borsthoogte.','Duw naar beneden tot je armen gestrekt zijn.','Laat gecontroleerd terug tot 90°.'],
    'Houd je ellebogen naast je lichaam, beweeg enkel je onderarmen.'),
  ('Plank','plank','core', array['Core'], array['Schouders','Bilspieren'], 'Bodyweight','beginner',
    array['Steun op je onderarmen en tenen, lichaam in één rechte lijn.','Span je core en billen aan.','Houd de positie vast en adem rustig door.'],
    'Laat je heupen niet zakken en til ze niet te hoog op.'),
  ('Hanging leg raise','hanging-leg-raise','core', array['Onderbuik'], array['Heupbuigers'], 'Bodyweight','intermediate',
    array['Hang met gestrekte armen aan de stang.','Hef je gestrekte of gebogen benen op tot heuphoogte.','Laat gecontroleerd zakken zonder te zwaaien.'],
    'Beweeg langzaam — controle is belangrijker dan hoogte.')
)
insert into exercises (gym_id, name, slug, category, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips, muscle, coach_id)
select g.id, s.name, s.slug, s.category, s.primary_muscles, s.secondary_muscles, s.equipment, s.difficulty, s.instructions, s.tips, s.primary_muscles[1], null
from g, seed s
on conflict (gym_id, slug) do nothing;
