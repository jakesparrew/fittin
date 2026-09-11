// Half afgemaakte JSON lezen.
//
// WAAROM DIT BESTAAT. Het model schrijft zijn antwoord als JSON, en JSON is pas te parsen wanneer
// het laatste haakje er staat. Zonder dit bestand kan je dus wel streamen, maar heb je tot de
// laatste seconde niets om te tonen — en dan is streamen alleen een duurdere manier om te wachten.
//
// Allebei de vormen beginnen met een zin in mensentaal: het plan met "samenvatting", het menu met
// "toelichting". Dat is geen toeval maar het handigste dat het model doet — het eerste wat het lid
// te zien krijgt is de zin die aan hém gericht is, niet een voortgangsbalk.
//
// De lezers hieronder raden nooit. Een dag die nog half geschreven wordt, komt er niet uit; een zin
// die nog groeit, komt eruit zoals hij nu staat. Wat niet leesbaar is, bestaat gewoon nog niet.

const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

/**
 * De waarde van een tekstsleutel, ook als ze nog niet af is.
 * @returns {{tekst:string, af:boolean}|null}
 */
export function groeiendeTekst(rauw, sleutel) {
  const s = String(rauw || "");
  const i = s.indexOf(`"${sleutel}"`);
  if (i < 0) return null;
  const dubbelpunt = s.indexOf(":", i + sleutel.length + 2);
  if (dubbelpunt < 0) return null;
  const open = s.indexOf('"', dubbelpunt + 1);
  if (open < 0) return null;

  let uit = "", escape = false;
  for (let j = open + 1; j < s.length; j++) {
    const c = s[j];
    if (escape) {
      uit += c === "n" ? "\n" : c === "t" ? "\t" : c;
      escape = false;
      continue;
    }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') return { tekst: uit, af: true };
    uit += c;
  }
  // Nog aan het schrijven. De halve zin is precies wat we willen tonen.
  return { tekst: uit, af: false };
}

/**
 * Alle objecten die al AF zijn in de array achter `sleutel`. Een object dat nog geschreven wordt,
 * blijft achterwege — half getelde haakjes zijn de klassieke manier om hier onzin uit te halen.
 */
export function afgewerkteObjecten(rauw, sleutel) {
  const s = String(rauw || "");
  const i = s.indexOf(`"${sleutel}"`);
  if (i < 0) return [];
  const haak = s.indexOf("[", i);
  if (haak < 0) return [];

  const uit = [];
  let diepte = 0, start = -1, inTekst = false, escape = false;
  for (let j = haak + 1; j < s.length; j++) {
    const c = s[j];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inTekst = !inTekst; continue; }
    if (inTekst) continue;

    if (c === "{") { if (diepte === 0) start = j; diepte++; }
    else if (c === "}") {
      diepte--;
      if (diepte === 0 && start >= 0) {
        try { uit.push(JSON.parse(s.slice(start, j + 1))); } catch { /* nog niet leesbaar */ }
        start = -1;
      }
    } else if (c === "]" && diepte === 0) break; // einde van déze array
  }
  return uit;
}

/** Wat er van een plan al te zien is. */
export function uitPlan(rauw) {
  const sam = groeiendeTekst(rauw, "samenvatting");
  const sessies = afgewerkteObjecten(rauw, "sessies")
    .map((s) => (typeof s?.naam === "string" ? { naam: s.naam, blokken: Array.isArray(s.blokken) ? s.blokken.length : 0 } : null))
    .filter(Boolean);
  const weken = afgewerkteObjecten(rauw, "weken")
    .map((w) => (typeof w?.focus === "string" ? { nr: Number(w.nr) || null, focus: w.focus } : null))
    .filter(Boolean);
  return { samenvatting: sam?.tekst || "", samenvattingAf: !!sam?.af, weken, sessies };
}

/**
 * Wat er van een menu al te zien is. De dagen dragen zelf geen naam — hun plaats in de lijst is de
 * dag, net zoals `schoonMenu` het verderop leest. Dat is meteen de reden dat dit hier gebeurt en
 * niet in de browser: één plek die weet dat item 0 maandag is.
 */
export function uitMenu(rauw) {
  const toe = groeiendeTekst(rauw, "toelichting");
  const dagen = afgewerkteObjecten(rauw, "dagen").slice(0, 7).map((d, i) => ({
    dag: DAGEN[i] || `dag ${i + 1}`,
    ontbijt: tekstOf(d?.ontbijt),
    lunch: tekstOf(d?.lunch),
    avondeten: tekstOf(d?.avondeten),
    tussendoor: tekstOf(d?.tussendoor),
  }));
  return { toelichting: toe?.tekst || "", toelichtingAf: !!toe?.af, dagen };
}

const tekstOf = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
