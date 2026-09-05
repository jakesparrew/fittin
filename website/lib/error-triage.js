// Sorteer client-fouten in "kan ik dit fixen?"-categorieën.
//
// Waarom dit bestaat: de foutenlijst liep vol met dingen waar geen code aan te veranderen valt —
// een telefoon die zijn verbinding verliest in de lift, of een vertaalhulpje dat de DOM verbouwt
// onder React vandaan. Als die tussen de échte bugs staan, wordt de hele lijst genegeerd.
// Ze wegmoffelen is óók fout (een golf netwerkfouten kan wél een storing zijn), dus: apart tonen.

// WebKit zegt "Load failed" waar Chrome "Failed to fetch" zegt; beide betekenen simpelweg
// "het verzoek is niet vertrokken". Onvermijdelijk op mobiel.
const NETWERK = [
  "load failed",
  "failed to fetch",
  "networkerror",
  // Firefox' formulering wanneer de bódy-stream van een al gestart antwoord wegvalt — de
  // verbinding brak terwijl de pagina binnenstroomde. Chrome en WebKit zeggen hierboven hetzelfde
  // met andere woorden. Gezien op 29-08-2026: 2× /account, één bezoeker, geen stack, daarna stil.
  "error in input stream",
  // Een promise die afgewezen wordt mét een Event als reden. Dat kan per constructie geen fout uit
  // onze eigen code zijn — een Event komt van een mislukte resource (afbeelding, script) of een
  // afgebroken verzoek. Sinds 31-08-2026 schrijft ErrorLogger die uit als "error op IMG <url>";
  // de kale vorm hieronder blijft staan voor de rijen van vóór die datum.
  "unhandledrejection: [object event]",
  "network request failed",
  "the network connection was lost",
  "the request timed out",
  "cancelled",
  "geannuleerd",
  "err_internet_disconnected",
  "err_network_changed",
];

// Externe DOM-manipulatie: Google Translate, Safari Reader, in-app browsers en extensies halen
// nodes weg onder React vandaan → NotFoundError bij removeChild/insertBefore. Klassiek, niet te
// verhelpen vanuit onze code.
const EXTERN = [
  "the object can not be found here",
  "notfounderror",
  "failed to execute 'removechild'",
  "failed to execute 'insertbefore'",
  "resizeobserver loop",
  "script error",
];

// Een stuk JavaScript dat niet binnenkomt. Twee oorzaken, allebei niets mis met de code:
// de bezoeker had de site nog open van vóór een nieuwe versie (het bestand heeft dan een nieuwe
// naam), of zijn verbinding haalde het bestand niet binnen. De app herlaadt zichzelf nu automatisch
// (components/ChunkErrorRecovery.jsx), dus dit hoort niet meer als bug te alarmeren. Een plotse
// gólf blijft wél zichtbaar in de netwerk-groep — dat zou op een echte storing wijzen.
const CHUNK = [
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
];

// Geïnjecteerd JavaScript van buitenaf, herkenbaar aan het schema in de stack. Onze eigen code
// staat altijd op https; alles hieronder is per definitie niet van ons.
//
// Waarom dit er nu bij komt: sinds de Meta-advertentie live staat (campagne gent-sep26) komt een
// deel van het verkeer binnen via de in-app browser van Facebook op Android. Die schuift zijn eigen
// `navigation_performance_logger_android` in elke pagina, en zodra de bezoeker wegnavigeert valt de
// Java-brug naar de app weg: "Error invoking postMessage: Java object is gone". Dat kan bij élke
// klik op de advertentie gebeuren, en elke keer vertrok er een alarmmail over iets waar geen regel
// code aan te veranderen valt. Een alarm dat vals blaast, wordt genegeerd wanneer het écht moet.
const VREEMD_SCHEMA = [
  "iabjs://", // in-app browser van Meta (Facebook/Instagram)
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "safari-web-extension://",
  "webkit-masked-url://", // zo maskeert Safari de code van een extensie
];

// Dezelfde in-app browsers, maar herkend aan de boodschap — sommige meldingen komen binnen zonder
// bruikbare stack. `postMessage` gebruiken we zelf nergens, dus dit kan nooit onze eigen fout zijn.
const INAPP = [
  "java object is gone",
  "error invoking postmessage",
];

export function classifyClientError(message, stack = "") {
  const m = String(message || "").toLowerCase();
  const s = String(stack || "").toLowerCase();
  if (CHUNK.some((n) => m.includes(n))) return "chunk";
  if (NETWERK.some((n) => m.includes(n))) return "netwerk";
  if (EXTERN.some((n) => m.includes(n))) return "extern";
  // Vóór de app-tak: een stack die naar geïnjecteerde code wijst, wint van elke boodschap.
  if (VREEMD_SCHEMA.some((n) => s.includes(n))) return "extern";
  if (INAPP.some((n) => m.includes(n))) return "extern";
  // removeChild-fouten dragen de aanwijzing soms alleen in de stack.
  if (s.includes("removechild") && (m.includes("not be found") || m.includes("not a child"))) return "extern";
  return "app";
}

// Korte uitleg bij een groep, zodat de owner niet hoeft te raden wat hij ziet.
export function explainClass(kind) {
  if (kind === "chunk") return "De bezoeker had de site nog open van vóór een nieuwe versie, of kreeg een bestand niet binnen. De app herlaadt zichzelf nu automatisch; je hoeft niets te doen. Blijft dit aanhouden ná een deploy, dan is er wél iets mis met de uitrol.";
  if (kind === "netwerk") return "Verbinding weggevallen bij de bezoeker — niets aan te fixen in de code. Alleen een plotse golf wijst op een storing.";
  if (kind === "extern") return "Veroorzaakt door iets buiten de app: de vertaalfunctie van de browser, een extensie, leesweergave, of de in-app browser van Facebook of Instagram die zijn eigen script meestuurt. Niet vanuit onze code op te lossen — verwacht dit vaker zolang er advertenties lopen.";
  return null;
}

export const isAppBug = (kind) => kind === "app";
