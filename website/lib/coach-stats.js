// ÉÉN plek die beslist wat een coachsessie is, en wat we per coach tonen.
//
// WAAROM DIT BESTAAT: /beheer/coaches, /beheer/analytics en het weekrapport telden elk zelf, en
// een herontwerp maakte bijna de klassieke fout — filteren op `coach_billing is not null` omdat
// dat "de sessies met een afrekening" lijkt. Dat filter wist een hele categorie ECHTE sessies:
// alles wat de BEHEERDER voor een coach inboekte. `admin_create_booking` zet geen coach_billing,
// terwijl de trigger uit 0094 daar wél coach_id zet. Nagemeten op productie: 6 van Jelle's 24
// bevestigde sessies hebben coach_billing NULL. Met dat filter zou hij van 24 naar 18 zakken en
// zou een coach die vorige week nog trainde als "74 dagen weg" gemarkeerd worden.
//
// De regel is dus: coach_id gezet + bevestigd. Niets anders.

export const COACH_SESSIE_KOLOMMEN =
  "id, coach_id, user_id, starts_at, status, coach_billing, notes, services(name)";

// Telt deze boeking als een sessie van deze coach?
// Geannuleerd en no-show tellen NIET mee — vandaag staan die gewoon tussen "Sessies met clients",
// waardoor een coach drukker lijkt dan hij is.
export function isCoachSessie(b) {
  return !!(b && b.coach_id && b.status === "bevestigd");
}

const DAG = 86400000;

/**
 * Rekent per coach de cijfers uit die op het overzicht komen.
 * @param {Array} rijen boekingen (ruw, ongefilterd)
 * @param {Date}  nu
 * @returns {Map<string, {sessies90:number, gepland:number, laatste:string|null, dagenGeleden:number|null, totaal:number}>}
 */
export function coachStats(rijen = [], nu = new Date()) {
  const nuMs = nu.getTime();
  const grens90 = nuMs - 90 * DAG;
  const per = new Map();
  const van = (id) => {
    if (!per.has(id)) per.set(id, { sessies90: 0, gepland: 0, laatste: null, dagenGeleden: null, totaal: 0 });
    return per.get(id);
  };

  for (const b of rijen) {
    if (!isCoachSessie(b)) continue;
    const t = new Date(b.starts_at).getTime();
    if (!Number.isFinite(t)) continue;
    const r = van(b.coach_id);
    r.totaal++;
    if (t > nuMs) {
      r.gepland++;
      continue; // een geplande sessie is geen "laatste sessie" en telt niet in de 90 dagen
    }
    if (t >= grens90) r.sessies90++;
    if (!r.laatste || t > new Date(r.laatste).getTime()) r.laatste = b.starts_at;
  }

  for (const r of per.values()) {
    if (r.laatste) r.dagenGeleden = Math.floor((nuMs - new Date(r.laatste).getTime()) / DAG);
  }
  return per;
}

// Lege statistiek voor een coach die nog nooit iets deed. `Map.get` op een onbekende id geeft
// undefined, en `undefined.sessies90` sloopt de hele pagina — precies het soort fout dat pas
// opduikt zodra er een nieuwe coach bijkomt.
export const LEGE_STATS = Object.freeze({ sessies90: 0, gepland: 0, laatste: null, dagenGeleden: null, totaal: 0 });
export const statsVan = (map, id) => map.get(id) || LEGE_STATS;

/**
 * Sessies per week voor de grafiek, over de laatste `weken` VOLLEDIGE weken (maandag→zondag).
 * De lopende week zit er bewust NIET in: TrendLine zet de laatste waarde groot in beeld, en een
 * halve week naast volle weken leest als een instorting die er niet is.
 */
export function perWeek(rijen = [], nu = new Date(), weken = 12) {
  const d = new Date(nu);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;              // 0 = maandag
  const dezeMaandag = new Date(d.getTime() - dow * DAG);
  const start = new Date(dezeMaandag.getTime() - weken * 7 * DAG);

  const emmers = [];
  for (let i = 0; i < weken; i++) {
    const van = new Date(start.getTime() + i * 7 * DAG);
    emmers.push({ van, tot: new Date(van.getTime() + 7 * DAG), value: 0 });
  }

  let dezeWeek = 0;
  for (const b of rijen) {
    if (!isCoachSessie(b)) continue;
    const t = new Date(b.starts_at).getTime();
    if (!Number.isFinite(t) || t > nu.getTime()) continue;
    if (t >= dezeMaandag.getTime()) { dezeWeek++; continue; }
    const i = Math.floor((t - start.getTime()) / (7 * DAG));
    if (i >= 0 && i < emmers.length) emmers[i].value++;
  }

  const label = (dt) => `${dt.getDate()}/${dt.getMonth() + 1}`;
  return { reeks: emmers.map((e) => ({ label: label(e.van), value: e.value })), dezeWeek };
}
