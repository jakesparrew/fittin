// Geslacht en geboortedatum, gedeeld door de twee aanmeldformulieren: de PT-intake van een klant
// (app/(site)/personal-training) en de sollicitatie van een coach (app/(site)/coach-worden).
//
// Waarom een GEBOORTEDATUM en geen leeftijd: een leeftijd veroudert. Wie zich vandaag aanmeldt als
// 34 staat over drie jaar nog altijd als 34 in de inbox. Een datum blijft kloppen; de leeftijd
// rekenen we erbij wanneer we hem tonen.
//
// Waarom `nu` een parameter is en niet Date.now(): zo is dit testbaar zonder de klok te verzetten,
// en kan er nooit per ongeluk een klokwaarde in een render terechtkomen (zie
// lib/hydration-clock.test.js — dat patroon heeft dit project al 46 foutmeldingen gekost).

// Geen "zeg ik liever niet" in de lijst: leeg IS dat antwoord. Een extra optie zou de bezoeker
// dwingen te kiezen tussen twee manieren om hetzelfde te zeggen.
export const GESLACHTEN = ["Vrouw", "Man", "X"];

// Ondergrens tegen typfouten, geen beleid: er staat geen leeftijdsgrens in de voorwaarden. Wie
// 1826 in plaats van 1926 tikt, of het jaartal van vandaag kiest, hoort dat te merken vóór het
// formulier vertrekt.
export const MIN_LEEFTIJD = 14;
export const MAX_LEEFTIJD = 100;

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Leeftijd in hele jaren op het moment `nu`. Telt de verjaardag pas mee als ze geweest is.
 * @param {string} geboorte  "JJJJ-MM-DD"
 * @param {Date} nu
 * @returns {number|null} null als de datum onbruikbaar is
 */
export function leeftijdOp(geboorte, nu) {
  const m = ISO_DATUM.exec(String(geboorte || "").trim());
  if (!m) return null;
  const [, jaar, maand, dag] = m.map(Number);
  // Vergelijk op kalenderdatum, niet op milliseconden: een tijdzoneverschil van twee uur mag geen
  // dag schelen, en een schrikkeldag mag geen jaar schelen.
  let leeftijd = nu.getFullYear() - jaar;
  const verjaardagGeweest = nu.getMonth() + 1 > maand || (nu.getMonth() + 1 === maand && nu.getDate() >= dag);
  if (!verjaardagGeweest) leeftijd -= 1;
  return leeftijd;
}

/**
 * Keurt de ingevulde geboortedatum.
 * @returns {{leeg: true} | {error: string} | {datum: string, leeftijd: number}}
 */
export function keurGeboortedatum(waarde, nu) {
  const tekst = String(waarde || "").trim();
  if (!tekst) return { leeg: true };

  const m = ISO_DATUM.exec(tekst);
  if (!m) return { error: "Vul je geboortedatum in als jaar-maand-dag." };

  const [, jaar, maand, dag] = m.map(Number);
  // Een echte kalendercontrole: 31 februari komt door de regex maar bestaat niet. Date corrigeert
  // zo'n datum stilzwijgend naar 3 maart, dus we kijken of hij nog dezelfde dag teruggeeft.
  const d = new Date(Date.UTC(jaar, maand - 1, dag));
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() + 1 !== maand || d.getUTCDate() !== dag) {
    return { error: "Die datum bestaat niet. Kijk ze even na." };
  }

  const leeftijd = leeftijdOp(tekst, nu);
  if (leeftijd === null) return { error: "Vul je geboortedatum in als jaar-maand-dag." };
  if (leeftijd < 0) return { error: "Die geboortedatum ligt in de toekomst. Kijk ze even na." };
  if (leeftijd < MIN_LEEFTIJD || leeftijd > MAX_LEEFTIJD) {
    return { error: "Kijk je geboortedatum even na — er lijkt een cijfer verkeerd te staan." };
  }
  return { datum: tekst, leeftijd };
}

/**
 * Keurt het geslacht. Leeg is een geldig antwoord ("zeg ik liever niet") en levert geen fout op.
 * @returns {string} de gekozen waarde, of "" als er niets (geldigs) gekozen is
 */
export function keurGeslacht(waarde) {
  const tekst = String(waarde || "").trim();
  // Bewust géén foutmelding bij een onbekende waarde: die kan alleen van geknoei met het formulier
  // komen, en dan is stil negeren beter dan een bezoeker blokkeren op iets wat hij niet ziet.
  return GESLACHTEN.includes(tekst) ? tekst : "";
}

/** Regel voor in de aanmeldingsmail. Leeg wanneer er niets ingevuld is. */
export function persoonsregel(geslacht, keuring) {
  const delen = [];
  if (geslacht) delen.push(`Geslacht: ${geslacht}`);
  if (keuring && keuring.datum) delen.push(`Geboortedatum: ${keuring.datum} (${keuring.leeftijd} jaar)`);
  return delen.join(" · ");
}
