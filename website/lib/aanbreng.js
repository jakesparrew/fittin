// Aanbrengvergoeding — de rekenkern en de controlelogica, los van de databank zodat ze testbaar is.
//
// De afspraak (owner, 2026-09-03): geeft Fittin' een klant door aan een coach, dan kost elke sessie
// die de coach met díé klant boekt een halve beurt extra — € 6 bovenop de € 12 zaalhuur. Per
// BOEKING, niet per uur: een sessie van twee uur kost 2 beurten zaal + 0,5 beurt aanbreng.
//
// Alles wordt in beurten gerekend, niet in euro's. Zie de kop van migratie 0152 voor het waarom.

export const BEURT_CENTS = 1200;
export const FEE_STANDAARD_CENTS = 600;
export const FEE_MAX_CENTS = 1200;

// € 6 → 0,5 beurt. Twee decimalen, want coach_ledger.delta is numeric(8,2) en € 3 = 0,25.
export const beurtenVoor = (feeCents) => Math.round(((Number(feeCents) || 0) / BEURT_CENTS) * 100) / 100;
// De weg terug, voor bedragen in het dashboard.
export const centsVoor = (beurten) => Math.round((Number(beurten) || 0) * BEURT_CENTS);

// "0,5" — Vlaamse notatie, hele getallen blijven heel.
export const beurtTekst = (n) => String(Number(n) || 0).replace(".", ",");
export const euroTekst = (cents) => "€ " + ((Number(cents) || 0) / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");

export const STATUS_LABEL = {
  voorgesteld: "Wacht op de coach",
  aanvaard: "Loopt",
  geweigerd: "Geweigerd",
  beeindigd: "Beëindigd",
};
export const STATUS_TOON = {
  voorgesteld: "bg-amber-100 text-amber-700",
  aanvaard: "bg-accent/15 text-accentdark",
  geweigerd: "bg-paper text-brand/50",
  beeindigd: "bg-paper text-brand/50",
};
export const BRON_LABEL = { intake: "Intake via de site", manueel: "Handmatig doorgegeven" };

// Wat de coach te zien krijgt bij het voorstel én bij elke boeking. Eén zin, overal dezelfde.
export const feeZin = (feeCents) =>
  `${beurtTekst(beurtenVoor(feeCents))} beurt extra per sessie (${euroTekst(feeCents)})`;

// Wat één boeking met deze klant in totaal kost, in beurten. `uren` = duur van de sessie.
export const kostVanBoeking = (uren, feeCents) => Math.round((Number(uren || 1) + beurtenVoor(feeCents)) * 100) / 100;

// ── Naamherkenning ────────────────────────────────────────────────────────────────
// Een coach die zijn klant niet koppelt, mag wél "externe client: Sarah D." invullen. Om te zien of
// dat toevallig een aangebrachte klant is, vergelijken we op voornaam + eerste letter van de
// achternaam. Bewust grof: dit beschuldigt niemand, het zet een rij bovenaan zodat de eigenaar
// er zelf naar kijkt. Te streng vergelijken (volledige naam) zou "Sarah" nooit matchen met
// "Sarah Declerck"; te los (alleen voornaam) zou twee verschillende Sarahs door elkaar halen —
// daarom telt de achternaam mee zodra beide kanten er een hebben.
export function naamDelen(naam) {
  const schoon = String(naam || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!schoon) return { voor: "", achter: "" };
  const stukken = schoon.split(" ");
  return { voor: stukken[0], achter: stukken.length > 1 ? stukken[stukken.length - 1] : "" };
}

export function naamLijktOp(a, b) {
  const x = naamDelen(a);
  const y = naamDelen(b);
  if (!x.voor || !y.voor) return false;
  if (x.voor !== y.voor) return false;
  // Heeft één van beide geen achternaam, dan is de voornaam het enige dat we hebben.
  if (!x.achter || !y.achter) return true;
  return x.achter[0] === y.achter[0];
}

// ── Controlelijst ─────────────────────────────────────────────────────────────────
// "Wat als een coach de client niet zet dat hij de sessie met hem doet?"
//
// Dan staat de sessie in het systeem als een gereserveerd uur op eigen naam (user_id = coach_id) en
// vindt de trigger geen aangebrachte klant. Deze functie zoekt precies die sessies op bij coaches
// die op dat moment een lopende doorgave hadden, zodat de eigenaar ze ziet en zelf beslist:
// alsnog aanrekenen, of afvinken. Er wordt niets automatisch aangerekend — een coach kan met een
// eigen klant trainen op hetzelfde uur, en een systeem dat dat zelf beslist is erger dan het gat.
//
// `reden`:
//   'naam-match'   — de externe naam lijkt op een aangebrachte klant → sterkste signaal
//   'geen-naam'    — helemaal geen naam ingevuld, terwijl er doorgaven lopen
//   'andere-naam'  — er staat een naam die op géén enkele doorgave lijkt → waarschijnlijk terecht
export function teControleren({ bookings = [], referrals = [], checked = [] } = {}, nu = Date.now()) {
  const afgevinkt = new Set(checked);
  const lopend = referrals.filter((r) => r.status === "aanvaard" && !r.ended_at);
  const perCoach = new Map();
  for (const r of lopend) {
    if (!perCoach.has(r.coach_id)) perCoach.set(r.coach_id, []);
    perCoach.get(r.coach_id).push(r);
  }

  const uit = [];
  for (const b of bookings) {
    if (afgevinkt.has(b.id)) continue;
    if (b.status !== "bevestigd") continue;
    if (!b.coach_id || b.user_id !== b.coach_id) continue; // enkel sessies zonder gekoppelde client
    if (new Date(b.starts_at).getTime() > nu) continue; // nog niet gebeurd → nog niets te controleren
    const doorgaven = perCoach.get(b.coach_id) || [];
    // Alleen doorgaven die al liepen toen deze sessie plaatsvond.
    const relevant = doorgaven.filter((r) => new Date(b.starts_at) >= new Date(r.referred_at));
    if (!relevant.length) continue;

    const naam = String(b.notes || "").trim();
    const kandidaten = naam ? relevant.filter((r) => naamLijktOp(naam, r.client_name)) : [];
    const reden = kandidaten.length ? "naam-match" : naam ? "andere-naam" : "geen-naam";
    uit.push({ bookingId: b.id, coachId: b.coach_id, startsAt: b.starts_at, naam: naam || null, reden, kandidaten, doorgaven: relevant });
  }

  const rang = { "naam-match": 0, "geen-naam": 1, "andere-naam": 2 };
  return uit.sort((a, b) => rang[a.reden] - rang[b.reden] || new Date(b.startsAt) - new Date(a.startsAt));
}

// Opbrengst van een lijst ledgerregels met reden 'aanbreng'/'aanbreng_terug', in euro-cent.
// Negatieve delta = de coach betaalde; de gym verdiende. Vandaar de omkering.
export function opbrengstCents(rows = []) {
  const som = rows
    .filter((r) => r.reason === "aanbreng" || r.reason === "aanbreng_terug")
    .reduce((a, r) => a + Number(r.delta || 0), 0);
  return Math.max(0, centsVoor(-som));
}

// Tweede lek, subtieler dan een lege sessie: de klant boekt de zaal ZELF (via /boeken, met de coach
// erbij gekozen). Dan betaalt de coach niets — ook vandaag al niet — en vindt de trigger geen
// 'credit'-boeking om een aanbreng op te hangen. De sessie is wél volledig herkenbaar: coach en
// klant staan er allebei op. Daarom hoort ze in het overzicht, niet in de schaduw.
//
// Er wordt niets automatisch aangerekend: of de gym in dit geval iets verdient, is een afspraak
// tussen de eigenaar en de coach, geen technische regel.
export function betaaldDoorDeKlant({ bookings = [], referrals = [], ledger = [], checked = [] } = {}, nu = Date.now()) {
  const afgevinkt = new Set(checked);
  const metAanbreng = new Set();
  for (const r of ledger) {
    if (r.reason === "aanbreng" && Number(r.delta || 0) < 0 && r.ref_id) metAanbreng.add(r.ref_id);
  }
  const lopend = referrals.filter((r) => r.status === "aanvaard" && !r.ended_at && r.client_id);
  const sleutel = (coachId, clientId) => `${coachId}|${clientId}`;
  const perPaar = new Map(lopend.map((r) => [sleutel(r.coach_id, r.client_id), r]));

  return bookings
    .filter((b) => {
      if (afgevinkt.has(b.id) || metAanbreng.has(b.id)) return false;
      if (b.status !== "bevestigd" || !b.coach_id || !b.user_id || b.user_id === b.coach_id) return false;
      if (b.coach_billing === "credit") return false; // dan doet de trigger het werk al
      if (new Date(b.starts_at).getTime() > nu) return false;
      const r = perPaar.get(sleutel(b.coach_id, b.user_id));
      return !!r && new Date(b.starts_at) >= new Date(r.referred_at);
    })
    .map((b) => ({ bookingId: b.id, coachId: b.coach_id, startsAt: b.starts_at, doorgave: perPaar.get(sleutel(b.coach_id, b.user_id)) }))
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
}
