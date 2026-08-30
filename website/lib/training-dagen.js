// Gedeelde logica achter "Mijn training" en het sessiescherm.
//
// Waarom dit hier staat en niet in de pagina: /training en /training/sessie moeten gegarandeerd
// dezelfde dag kiezen en dezelfde cijfers tonen. Stond die berekening twee keer, dan wijzen ze bij
// de eerste wijziging naar een andere dag — en dan opent het lid iets anders dan de kaart beloofde.

const asArray = (sj) =>
  Array.isArray(sj) ? sj : sj && typeof sj === "object" && (sj.reps != null || sj.weight_kg != null) ? [sj] : [];
const topW = (sj) => asArray(sj).reduce((m, s) => Math.max(m, s?.weight_kg || 0), 0);

// Zet het programma om naar de vorm die de speler verwacht: dagen op day_no, oefeningen op
// position (met id als tweede sleutel, zodat rijen van vóór de position-fix stabiel blijven).
export function bouwDagen(program, logs, vandaag) {
  const perOefening = {};
  for (const l of logs || []) (perOefening[l.program_exercise_id] ||= []).push(l);

  return [...(program?.program_days || [])]
    .sort((a, b) => a.day_no - b.day_no)
    .map((d) => ({
      id: d.id,
      name: d.name,
      day_no: d.day_no,
      exercises: [...(d.program_exercises || [])]
        .sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.id).localeCompare(String(b.id)))
        .map((pe) => {
          const peLogs = perOefening[pe.id] || [];
          const doneToday = peLogs.some((l) => l.logged_on === vandaag);
          // Liefst de laatste sessie die écht sets bevat, niet een kale "klaar"-tik.
          const laatste =
            peLogs.find((l) => l.logged_on !== vandaag && asArray(l.sets_json).length) ||
            peLogs.find((l) => l.logged_on !== vandaag);
          return {
            peId: pe.id,
            sets: pe.sets,
            reps: pe.reps,
            rest_sec: pe.rest_sec,
            notes: pe.notes,
            tempo: pe.tempo,
            targetWeight: pe.target_weight_kg,
            rpe: pe.rpe,
            supersetGroup: pe.superset_group,
            exercise: pe.exercises,
            doneToday,
            lastSets: laatste ? asArray(laatste.sets_json) : [],
            pr: peLogs.reduce((m, l) => Math.max(m, topW(l.sets_json)), 0),
          };
        }),
    }));
}

// Welke dag is vandaag aan de beurt?
//
// Bewust afgeleid uit de logs en niet uit een kalender: program_days heeft geen datum en krijgt er
// ook geen. Drie gevallen, in deze volgorde:
//   1. Vandaag al iets gelogd  → die dag, want je bent er middenin bezig.
//   2. Eerder al iets gelogd   → de volgende dag in de rij, rondlopend na de laatste.
//   3. Nog nooit iets gelogd   → dag 1.
export function kiesDagId(dagen, logs, vandaag) {
  if (!dagen?.length) return null;
  const dagVanOefening = {};
  for (const d of dagen) for (const pe of d.exercises) dagVanOefening[pe.peId] = d.id;

  const eigen = (logs || []).filter((l) => dagVanOefening[l.program_exercise_id]);
  const vanVandaag = eigen.find((l) => l.logged_on === vandaag);
  if (vanVandaag) return dagVanOefening[vanVandaag.program_exercise_id];

  // `logs` komt binnen gesorteerd op created_at aflopend, maar daar rekenen we niet op.
  const eerder = eigen
    .filter((l) => l.logged_on < vandaag)
    .sort((a, b) => String(b.logged_on).localeCompare(String(a.logged_on)))[0];
  if (!eerder) return dagen[0].id;

  const i = dagen.findIndex((d) => d.id === dagVanOefening[eerder.program_exercise_id]);
  return dagen[(i + 1) % dagen.length].id;
}

// Ruwe tijdsindicatie: per set ongeveer 40 seconden werk plus de voorgeschreven rust (90s als de
// coach niets invulde). Afgerond op 5 minuten, want een schatting die "43 min" zegt doet alsof ze
// nauwkeurig is. Minimaal 10 zodat een dag van één oefening geen "0 min" toont.
export function schatMinuten(exercises) {
  const sec = (exercises || []).reduce((t, pe) => {
    const sets = Math.max(1, pe.sets || 3);
    return t + sets * (40 + (pe.rest_sec ?? 90));
  }, 0);
  return Math.max(10, Math.round(sec / 60 / 5) * 5);
}

// Samenvatting van wat er vandaag effectief gelogd is — voor de afsluitkaart van een sessie.
export function sessieResultaat(dag, logs, vandaag) {
  const peIds = new Set((dag?.exercises || []).map((pe) => pe.peId));
  const vandaagLogs = (logs || []).filter((l) => l.logged_on === vandaag && peIds.has(l.program_exercise_id));
  let sets = 0;
  let volume = 0;
  for (const l of vandaagLogs) {
    for (const s of asArray(l.sets_json)) {
      sets += 1;
      volume += (Number(s.reps) || 0) * (Number(s.weight_kg) || 0);
    }
  }
  return {
    oefeningen: vandaagLogs.length,
    totaal: (dag?.exercises || []).length,
    sets,
    volume: Math.round(volume),
    prs: (dag?.exercises || []).filter((pe) => pe.doneToday && pe.pr > 0).length,
  };
}
