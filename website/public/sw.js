// PWA service worker.
//
// v4 (2026-08-09) — na een golf ChunkLoadErrors op / en /login bij niet-ingelogde bezoekers.
// De foutmelding zei "(timeout: …/_next/static/chunks/…)" en NIET "(error: …)". Dat verschil is
// beslissend: een verdwenen chunk geeft meteen een 404 en dus `error`. Een `timeout` betekent dat
// het verzoek bleef hangen tot webpack er na 120 seconden mee stopte.
//
// De oorzaak zat hier: v3 deed `event.respondWith(fetch(request)...)` ZONDER deadline. Op een
// wankele mobiele verbinding lost die fetch nooit op én faalt ze nooit, dus de `.catch()` met de
// cache-fallback kwam er nooit aan te pas. De bezoeker keek twee minuten naar een halve pagina.
//
// Twee wijzigingen:
//  1. Elke netwerkoproep heeft een harde deadline (AbortController), zodat we altijd binnen enkele
//     seconden bij de cache-fallback belanden in plaats van te blijven wachten.
//  2. Bestanden onder /_next/static/ komen nu EERST uit de cache. Hun naam bevat een inhoudshash,
//     dus ze zijn onveranderlijk: uit de cache serveren kan nooit "verouderd" zijn, en het haalt
//     het netwerk volledig uit het pad voor precies de bestanden die deze fout veroorzaakten.
const CACHE = "fittin-v4";
const OFFLINE_FALLBACK = "/offline";
// Ruim boven een normale mobiele respons, ruim onder de 120 s van webpack. Wie hierna nog niets
// heeft, heeft geen bruikbare verbinding — dan is de cache sowieso het betere antwoord.
const DEADLINE_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_FALLBACK, "/"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Haalt op met een harde deadline. Bewust met AbortController en niet met een losse timer: anders
// blijft het verzoek op de achtergrond hangen en houdt het een verbinding bezet.
async function haalOp(request, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(request, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function bewaar(request, res) {
  const kopie = res.clone();
  caches.open(CACHE).then((c) => c.put(request, kopie)).catch(() => {});
}

// Onveranderlijke build-bestanden (/_next/static/…): cache eerst.
async function cacheEerst(request) {
  const uitCache = await caches.match(request);
  if (uitCache) return uitCache;
  // Nog niet gezien: ophalen, bewaren. Lukt dat niet, dan geven we de fout dóór in plaats van te
  // blijven hangen — zo krijgt webpack meteen een echte fout en kan de app zichzelf herstellen
  // (zie components/ChunkErrorRecovery.jsx) in plaats van twee minuten te wachten.
  const res = await haalOp(request, DEADLINE_MS);
  if (res && res.ok) bewaar(request, res);
  return res;
}

// Alles anders: netwerk eerst (altijd verse code), cache als vangnet.
async function netwerkEerst(request, url) {
  try {
    const res = await haalOp(request, DEADLINE_MS);
    if (res && res.ok && (request.mode === "navigate" || /\.(?:css|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname))) {
      bewaar(request, res);
    }
    return res;
  } catch {
    const uitCache = await caches.match(request);
    if (uitCache) return uitCache;
    // Enkel bij een échte paginanavigatie heeft de offline-pagina zin; een gefaalde losse fetch
    // moet gewoon falen zodat de app haar eigen foutafhandeling kan doen.
    if (request.mode === "navigate") return (await caches.match(OFFLINE_FALLBACK)) || Response.error();
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase/Stripe/derden niet aanraken

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheEerst(request));
    return;
  }
  event.respondWith(netwerkEerst(request, url));
});
