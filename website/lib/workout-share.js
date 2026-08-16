// Pure logica rond het delen en overnemen van schema's, plus het duo-zicht.
// Bewust zonder database-aanroepen: de regels hieronder bepalen wat een bezoeker mag zien en wat
// een overgenomen schema wordt, en dat moet testbaar zijn zonder Supabase.

// Sleutel voor de login-vrije deelpagina. 22 tekens uit een alfabet van 32 ≈ 110 bits: niet te
// raden, en kort genoeg om in een WhatsApp-bericht niet als spam te ogen. Bewust zonder i/l/o/u:
// die worden bij het overtikken verward met 1/0, en een deellink wordt overgetikt.
const ALFABET = "abcdefghjkmnpqrstvwxyz23456789";
export const SHARE_TOKEN_LEN = 22;

export function nieuwShareToken(rnd = () => Math.random()) {
  let s = "";
  for (let i = 0; i < SHARE_TOKEN_LEN; i++) s += ALFABET[Math.floor(rnd() * ALFABET.length)];
  return s;
}

export const shareUrl = (token, site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be") =>
  `${site}/w/${token}`;

// Wat een bezoeker van een gedeeld schema te zien krijgt. Alles wat niet nodig is om het schema te
// begrijpen, gaat eruit: geen e-mail, geen achternaam, geen gewichten of logs van de eigenaar.
// Een gedeeld schema is een RECEPT, geen dagboek.
export function publiekSchema(program, dagen = [], eigenaarNaam = "") {
  return {
    naam: program?.name || "Schema",
    subtitel: program?.subtitle || null,
    niveau: program?.level || null,
    minuten: program?.est_minutes || null,
    focus: program?.focus || null,
    // Enkel de voornaam: genoeg om het persoonlijk te maken, te weinig om iemand te identificeren.
    door: String(eigenaarNaam || "").trim().split(/\s+/)[0] || null,
    dagen: (dagen || []).map((d) => ({
      naam: d.name || `Dag ${d.day_no}`,
      oefeningen: (d.oefeningen || []).map((pe) => ({
        naam: pe.exercise?.name || "Oefening",
        slug: pe.exercise?.slug || null,
        beeld: pe.exercise?.image_url || null,
        sets: pe.sets ?? null,
        reps: pe.rep_text || (pe.reps != null ? String(pe.reps) : null),
        rust: pe.rest_sec ?? null,
        // target_weight_kg bewust WEG: dat is het gewicht van de deler, niet van de lezer.
      })),
    })),
  };
}

// Een overgenomen schema is een kopie, geen koppeling: de nieuwe eigenaar mag alles aanpassen
// zonder dat het origineel verandert. Daarom nooit share_token, is_public of slug meekopiëren —
// dan zou een kopie per ongeluk onder dezelfde link leven.
export function kopieVelden(bron, nieuweEigenaar, gymId) {
  return {
    gym_id: gymId,
    member_id: nieuweEigenaar,
    name: bron?.name ? `${bron.name} (overgenomen)` : "Overgenomen schema",
    subtitle: bron?.subtitle || null,
    description: bron?.description || null,
    level: bron?.level || null,
    est_minutes: bron?.est_minutes || null,
    focus: bron?.focus || null,
    is_template: false,
    is_public: false,
    is_active: false,
    slug: null,
    share_token: null,
  };
}

// ---- Duo-zicht ----------------------------------------------------------------------------
// Wie van je buddies is vandaag met hetzelfde bezig? Puur rekenwerk op al opgehaalde rijen, zodat
// de privacyregel op één plek staat en te testen is.
//
// Drie voorwaarden, elk met een reden:
//  • het moet een GEACCEPTEERDE buddy zijn (geen openstaand verzoek);
//  • die buddy moet zichtbaarheid hebben aangezet (training_visible_to_buddies);
//  • het moet vandaag zijn — "Jelle deed dit vorige maand" is geen samen trainen.
export function duoVoortgang({ logs = [], buddyIds = [], zichtbaar = [], vandaag, peIds = [] }) {
  const mag = new Set(zichtbaar.filter((id) => buddyIds.includes(id)));
  const relevant = new Set(peIds);
  const per = new Map();
  for (const l of logs) {
    if (!mag.has(l.user_id)) continue;
    if (l.logged_on !== vandaag) continue;
    if (relevant.size && !relevant.has(l.program_exercise_id)) continue;
    const sets = Array.isArray(l.sets_json) ? l.sets_json.length : 0;
    const p = per.get(l.user_id) || { userId: l.user_id, oefeningen: 0, sets: 0 };
    p.oefeningen += 1;
    p.sets += sets;
    per.set(l.user_id, p);
  }
  return [...per.values()].sort((a, b) => b.sets - a.sets);
}
