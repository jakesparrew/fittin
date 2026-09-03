// ÉÉN bron van waarheid voor "wat is deze coach nog verschuldigd?".
//
// Waarom dit bestaat: de schuld van een coach zat verspreid over drie mechanismen, en elke pagina
// rekende ze op haar eigen manier (deels) uit. Daardoor kon hetzelfde bedrag op het ene scherm
// € 0 zijn en op het andere € 96.
//
// Het concrete incident (2026-08-06): de coaches-pagina toonde "Te factureren" alleen wanneer het
// PROFIEL op `invoice` stond. Toen alle coaches naar `credit` werden omgezet, verdween € 156 aan
// echte schuld uit beeld — de betrokken coaches toonden "Saldo: 0" alsof alles vereffend was.
// Les: schuld hangt aan de BOEKINGEN en de BETAALPOSTEN, nooit aan een instelling op het profiel.
//
// De drie mechanismen:
//   1. factuur   — bevestigde boekingen met coach_billing='invoice' die nog niet gefactureerd zijn
//   2. open post — payments (kind='coach_credits') met status 'onbetaald' (tegoed al toegekend)
//   3. negatief  — een coach_ledger-saldo onder nul (meer geboekt dan gekocht)
//
// Ze sluiten elkaar niet uit: dezelfde coach kan er twee tegelijk hebben.
// De rekenkern staat bewust apart van de database, zodat ze testbaar is met vaste gegevens.
// De fout die dit bestand veroorzaakte zat níét in de optelling maar in de vraag "van welk veld
// hangt de schuld af?" — daarom legt lib/coach-debt.test.js precies dat geval vast.
export function aggregateDebts({ bookings = [], payments = [], ledger = [] }) {
  const per = new Map();
  const van = (id) => {
    if (!per.has(id)) per.set(id, { coachId: id, factuurCents: 0, factuurSessies: 0, sessies: [], openPostCents: 0, saldo: 0, negatiefCents: 0, totaalCents: 0 });
    return per.get(id);
  };

  // 1. Nog te factureren sessies. Bewust ZONDER `starts_at <= nu`-filter: de verplichting ontstaat
  //    bij het boeken, niet bij het plaatsvinden. Anders blokkeert de boekrem een coach op een
  //    bedrag dat de beheerder nergens ziet staan en dus ook niet kán factureren.
  for (const b of bookings) {
    const r = van(b.coach_id);
    r.factuurCents += b.coach_charge_cents || 0;
    r.factuurSessies++;
    r.sessies.push({ id: b.id, starts_at: b.starts_at, cents: b.coach_charge_cents || 0 });
  }

  // 2. Toegekend tegoed waarvoor nog niet betaald is. Bewust NIET op periode gefilterd: een open
  //    post is een lopend saldo, geen maandcijfer. Filteren op de huidige maand liet schuld van
  //    vorige maand stilzwijgend verdwijnen.
  for (const p of payments) van(p.user_id).openPostCents += p.amount_cents || 0;

  // 3. Negatief tegoedsaldo.
  const saldi = new Map();
  for (const l of ledger) saldi.set(l.coach_id, (saldi.get(l.coach_id) || 0) + Number(l.delta || 0));
  for (const [id, saldo] of saldi) {
    const r = van(id);
    r.saldo = saldo;
    if (saldo < 0) r.negatiefCents = Math.round(Math.abs(saldo) * 1200);
  }
  for (const r of per.values()) if (!saldi.has(r.coachId)) r.saldo = 0;

  for (const r of per.values()) r.totaalCents = r.factuurCents + r.openPostCents + r.negatiefCents;
  return per;
}

export async function coachDebts(supabase, gymId) {
  const [{ data: bk }, { data: pay }, { data: led }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, coach_id, starts_at, coach_charge_cents, coach_billing, coach_invoiced_at, status")
      .eq("gym_id", gymId)
      .eq("coach_billing", "invoice")
      .eq("status", "bevestigd")
      .is("coach_invoiced_at", null)
      .order("starts_at")
      .limit(5000),
    supabase
      .from("payments")
      .select("id, user_id, amount_cents, created_at, description")
      .eq("gym_id", gymId)
      .eq("kind", "coach_credits")
      .eq("status", "onbetaald")
      .limit(5000),
    supabase.from("coach_ledger").select("coach_id, delta").eq("gym_id", gymId).limit(5000),
  ]);

  return aggregateDebts({ bookings: bk || [], payments: pay || [], ledger: led || [] });
}

// Een volledig nul-object voor een coach die in geen van de drie bronnen voorkomt.
//
// WAAROM DIT MOET: aggregateDebts bouwt alleen een entry voor een coach die ergens in de
// boekingen, de open posten of het tegoedboek voorkomt. Voor een net aangemaakte coach — of voor
// Sophie, die nooit iets deed — geeft `map.get(id)` dus `undefined`, en `undefined.saldo` sloopt
// de pagina. De huidige pagina ontsnapt daaraan met een aparte saldo-map en `|| 0`; wie die
// vereenvoudigt naar één bron loopt er recht in.
export const LEGE_SCHULD = Object.freeze({
  coachId: null, factuurCents: 0, factuurSessies: 0, sessies: [],
  openPostCents: 0, saldo: 0, negatiefCents: 0, totaalCents: 0,
});
export const debtOf = (map, id) => (map && map.get(id)) || LEGE_SCHULD;

// Korte omschrijving van waar de schuld vandaan komt, voor in de UI. Zonder deze uitleg leest
// "€ 108 openstaand" als één bedrag, terwijl het uit twee heel verschillende dingen kan bestaan
// die je elk anders moet innen (factureren vs. een bestaande factuur laten betalen).
export function debtReasons(r) {
  if (!r) return [];
  const uit = [];
  if (r.factuurCents) uit.push(`${r.factuurSessies} sessie${r.factuurSessies === 1 ? "" : "s"} nog te factureren`);
  if (r.openPostCents) uit.push("factuur verstuurd, nog niet betaald");
  if (r.negatiefCents) uit.push(`tegoed staat ${String(r.saldo).replace(".", ",")} in de min`);
  return uit;
}
