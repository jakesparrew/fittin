// Wat is het ENE ding dat dit lid nu moet doen?
//
// Waarom dit een eigen bestand is en geen if-boom in de pagina: het scherm toonde de belangrijkste
// handeling als tekstlink onder een streep ("Nog geen moment geboekt? Boek je sessie"), terwijl er
// zonder boeking helemaal niets gebeurt — geen zaal, geen deurcode, geen workout in de mail. De
// volgorde van dat scherm klopte niet met de volgorde van de werkelijkheid.
//
// Alles hier is puur: de klok komt binnen als parameter, nooit uit `Date.now()`. Zo kan een client
// component de uitkomst renderen zonder hydratatieverschil, en zo is elk geval testbaar.

/**
 * @param {object} o
 * @param {object[]} o.sessies      de sessies van de open week (met gedaan_at)
 * @param {object[]} o.boekingen    bevestigde boekingen van dit lid, oplopend op starts_at
 * @param {boolean}  o.checkin      is de check-in van deze week ingevuld
 * @param {boolean}  o.magCheckin   staat het check-informulier open
 * @param {boolean}  o.laatsteWeek  is dit de laatste week van het plan
 * @param {number}   o.nu           tijdstip in ms
 * @returns {{soort:string, titel:string, tekst:string, knop:{label:string, href:string}|null, stil?:boolean}}
 */
export function volgendeStap({ sessies = [], boekingen = [], checkin = false, magCheckin = false, laatsteWeek = false, nu = 0 }) {
  const teDoen = sessies.filter((s) => !s.gedaan_at).length;
  const komend = boekingen.filter((b) => new Date(b.starts_at).getTime() > nu);
  const eerstvolgend = komend[0] || null;

  // 1. De week is afgewerkt. Dan is de check-in het enige dat de volgende week nog tegenhoudt.
  if (teDoen === 0 && sessies.length > 0) {
    if (!checkin && magCheckin) {
      return {
        soort: "checkin",
        titel: "Je week zit erop",
        tekst: "Nog vier tikken over hoe het ging, en je volgende week wordt daarop gebouwd.",
        knop: { label: "Check-in invullen", href: "#checkin" },
      };
    }
    if (!checkin) {
      return { soort: "wachten", titel: "Alles afgevinkt", tekst: "Je check-in verschijnt zodra de week rond is.", knop: null, stil: true };
    }
    return {
      soort: "klaar",
      titel: laatsteWeek ? "Je laatste week is af" : "Alles staat klaar",
      tekst: laatsteWeek
        ? "Zondag sluit je coach je plan af en kijkt hij terug op de hele reeks."
        : "Zondagavond zet je coach je volgende week klaar, met een woordje over hoe het ging.",
      knop: null, stil: true,
    };
  }

  // 2. Er zijn nog sessies, maar minder geboekte momenten dan sessies. Dit is het gat waar de meeste
  //    plannen stilvallen: het lid heeft een schema en geen afspraak met zichzelf.
  const tekort = teDoen - komend.length;
  if (tekort > 0) {
    const eerste = komend.length === 0 && sessies.every((s) => !s.gedaan_at);
    return {
      soort: "boeken",
      titel: eerste ? "Boek je eerste sessie" : tekort === teDoen ? "Boek je volgende sessie" : `Nog ${tekort} ${tekort === 1 ? "moment" : "momenten"} te boeken`,
      tekst: eerste
        ? "Zonder geboekt moment gebeurt er niets: de zaal is van jou alleen tijdens je uur, en je workout reist mee in je deurcodemail."
        : `Je hebt deze week nog ${teDoen} ${teDoen === 1 ? "sessie" : "sessies"} en ${komend.length} ${komend.length === 1 ? "moment" : "momenten"} geboekt.`,
      knop: { label: "Kies een moment", href: "/boeken" },
    };
  }

  // 3. Alles geboekt. Dan is er niets te doen behalve gaan.
  return {
    soort: "gepland",
    titel: "Je volgende sessie staat geboekt",
    tekst: "Je krijgt je deurcode vijf minuten vooraf, met de oefeningen erbij. Afvinken kan met één tik in die mail.",
    knop: null, stil: true,
    boeking: eerstvolgend,
  };
}

/**
 * Hoeveel dagen loopt deze week nog? De zondagcron werkt een week pas af als hij zes dagen open
 * staat, dus dat is de horizon die het lid moet zien — niet een kalenderweek.
 * @returns {number|null} hele dagen, of null als de week nog niet open staat
 */
export function dagenTeGaan(unlockedAt, nu, venster = 7) {
  if (!unlockedAt) return null;
  const verstreken = (nu - new Date(unlockedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(venster - verstreken));
}

/**
 * Wat er veranderde aan één oefening ten opzichte van vorige week, als leesbare tekst — of null
 * wanneer er niets veranderde of er geen vorige week is.
 *
 * Dit is het zichtbare gevolg van het afvinken. Zonder deze regel tikte een lid "te licht" en zag
 * hij de week erna een schema dat er identiek uitzag; het vinkje was dan een handeling zonder
 * merkbaar effect, en zulke handelingen sterven uit.
 */
export function verschilTekst(nu_, vorig) {
  if (!vorig) return null;
  const delen = [];
  if (Number.isFinite(nu_?.reps) && Number.isFinite(vorig.reps) && nu_.reps !== vorig.reps) {
    delen.push(`${vorig.reps} → ${nu_.reps} herhalingen`);
  }
  if (Number.isFinite(nu_?.sets) && Number.isFinite(vorig.sets) && nu_.sets !== vorig.sets) {
    delen.push(`${vorig.sets} → ${nu_.sets} reeksen`);
  }
  if (Number.isFinite(nu_?.kg) && Number.isFinite(vorig.kg) && nu_.kg !== vorig.kg) {
    delen.push(`${vorig.kg} → ${nu_.kg} kg`);
  }
  return delen.length ? delen.join(" · ") : null;
}
