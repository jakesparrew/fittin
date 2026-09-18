// Fittin' Punten — lezen en schrijven. De regels zelf staan in lib/punten.js (puur, getest).

import { tellers, niveauVan, waarde, bereken, WAARDEN, isoWeek, dowUur, reeks, klassement, NIET_KLASSEMENT, promoVoor } from "./punten.js";
import { notify } from "./notify.js";

export const STANDAARD_INSTELLINGEN = {
  aan: true, gestart_op: null, waarden: {}, prijs_sessie: 300, max_gym_maand: 10, max_aanbreng_maand: 5,
  max_per_lid_maand: 1, verval_maanden: 12, rustig_aan: true, rustig_max_weken: 1, druk_min_weken: 5, max_rustige_uren: 12,
};

export async function laadInstellingen(admin, gymId) {
  const { data } = await admin.from("gamification_settings").select("*").eq("gym_id", gymId).maybeSingle();
  return data ? { ...STANDAARD_INSTELLINGEN, ...data } : null;
}

/** Alles ophalen, ook boven de 1000 rijen van PostgREST. `bouw` maakt telkens een verse query. */
export async function alles(bouw, per = 1000) {
  const uit = [];
  for (let van = 0; ; van += per) {
    const { data, error } = await bouw().range(van, van + per - 1);
    if (error) throw new Error(error.message);
    uit.push(...(data || []));
    if (!data || data.length < per) return uit;
  }
}

/**
 * Punten wegschrijven. Idempotent: een bron die er al staat, wordt stil overgeslagen (ON CONFLICT DO NOTHING).
 * @returns de rijen die ÉCHT nieuw zijn — enkel daarover sturen we meldingen.
 */
export async function schrijfPunten(admin, rijen) {
  const nieuw = [];
  const schoon = (rijen || []).filter((r) => r && r.user_id && r.source_key && Number.isFinite(r.points) && r.points !== 0);
  for (let i = 0; i < schoon.length; i += 500) {
    const deel = schoon.slice(i, i + 500);
    const { data, error } = await admin.from("member_points")
      .upsert(deel, { onConflict: "gym_id,source_key", ignoreDuplicates: true })
      .select("id, user_id, kind, points, source_key, meta");
    if (error) throw new Error(`punten schrijven: ${error.message}`);
    nieuw.push(...(data || []));
  }
  return nieuw;
}

/** Het puntenboek van één lid + de tellers. */
export async function puntenVan(admin, userId, { limit = 200 } = {}) {
  const { data: rijen } = await admin.from("member_points").select("id, kind, points, source_key, meta, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(5000);
  const maandStart = beginMaand();
  const t = tellers(rijen || [], { sinds: maandStart });
  return { ...t, niveau: niveauVan(t.lifetime), rijen: (rijen || []).slice(0, limit), alle: rijen || [] };
}

export function beginMaand(d = new Date(), terug = 0) {
  const [j, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit" }).format(d).split("-").map(Number);
  const mm = m - 1 - terug;
  const jaar = j + Math.floor(mm / 12), maand = ((mm % 12) + 12) % 12;
  // 1e van de maand, 00:00 in Brussel → UTC. Zomertijd: +2, anders +1; we zoeken het juiste uur.
  for (const off of [2, 1]) {
    const t = new Date(Date.UTC(jaar, maand, 1, -off));
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(t);
    if (Number(h) % 24 === 0) return t.toISOString();
  }
  return new Date(Date.UTC(jaar, maand, 1)).toISOString();
}
export const maandSleutel = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit" }).format(new Date(iso));

/**
 * Eén verdienmoment meteen toekennen (zaalcheck, rating, profiel …) — met het niveau-perk van dit moment.
 * Geeft de toegekende punten terug (0 als de bron er al stond, de actie uit staat, of het lid geen lid is).
 */
export async function geefNu(admin, { gymId, userId, kind, key, sourceKey, rustig = false, meta = {} }) {
  if (!gymId || !userId) return 0;
  const [s, { data: prof }] = await Promise.all([
    laadInstellingen(admin, gymId),
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (!s?.aan || prof?.role !== "lid") return 0;
  const basis = waarde(s, key || kind);
  if (!(basis > 0)) return 0;
  const { lifetime } = await puntenVan(admin, userId, { limit: 0 });
  const points = bereken(basis, { lifetime, rustig, settings: s });
  const nieuw = await schrijfPunten(admin, [{ gym_id: gymId, user_id: userId, kind, points, source_key: sourceKey, meta: { ...meta, basis } }]);
  return nieuw.length ? points : 0;
}

/** Meldingen na een ronde: nieuwe badge, nieuw niveau, genoeg voor een gratis sessie. */
export async function meldVooruitgang({ gymId, userId, voor, na, prijs, badges = [] }) {
  for (const b of badges) {
    await notify({ gymId, userId, type: "system", title: `Nieuwe badge: ${b.e} ${b.l}`, body: b.punten ? `+${b.punten} punten · ${b.uitleg}` : b.uitleg, link: "/account/punten" });
  }
  const nv = niveauVan(voor.lifetime), nn = niveauVan(na.lifetime);
  if (nn.index > nv.index) {
    await notify({ gymId, userId, type: "system", title: `Nieuw niveau: ${nn.naam} 🎉`, body: nn.id === "vaste_klant" ? "Vanaf nu krijg je 10 % extra punten op alles." : `Je hebt ${na.lifetime} punten verdiend.`, link: "/account/punten" });
  }
  if (voor.saldo < prijs && na.saldo >= prijs) {
    await notify({ gymId, userId, type: "system", title: "Je kan een gratis sessie inwisselen 🎁", body: `Je hebt ${na.saldo} punten — een gratis sessie kost er ${prijs}.`, link: "/account/punten" });
  }
}

/** Voor het rooster: de klasse en pin per uur-van-de-week, en of de regeling aan staat. */
export async function laadRustigeUren(admin, gymId) {
  const [{ data: rijen }, s] = await Promise.all([
    admin.from("slot_demand").select("dow, hour, klasse, pin, weeks_booked").eq("gym_id", gymId),
    laadInstellingen(admin, gymId),
  ]);
  return { aan: s ? s.rustig_aan !== false : true, rijen: rijen || [] };
}

/**
 * Rustige momenten om voor te stellen (accountkaart, weekmail). Per dag één moment: het rustige uur dat het
 * dichtst bij 18:00 ligt, tussen 08:00 en 21:00 — anders stelt het systeem altijd 06:00 voor, en dat is niet
 * waar mensen willen trainen.
 */
export function rustigsteMomenten({ aan, rijen }, { vanaf = Date.now(), dagen = 7, van = 8, tot = 21, voorkeur = 18, bezet = new Set(), max = 3 } = {}) {
  if (!aan) return [];
  const per = new Map(rijen.map((r) => [`${r.dow}:${r.hour}`, r]));
  const uit = [];
  for (let d = 0; d < dagen && uit.length < max; d++) {
    const dag = new Date(vanaf + d * 86400000);
    let beste = null;
    for (let h = van; h <= tot; h++) {
      const iso = bxlMoment(dag, h);
      const t = new Date(iso).getTime();
      if (t < vanaf + 3600000 || bezet.has(t)) continue;
      const { dow, hour } = dowUur(iso);
      const r = per.get(`${dow}:${hour}`);
      const v = per.get(`${dow}:${hour + 1}`);
      if (promoVoor(r, v, t, vanaf, { aan }) !== "rustig") continue; // start- én volgend uur rustig
      if (!beste || Math.abs(h - voorkeur) < Math.abs(beste.h - voorkeur)) beste = { iso, h, weeks: r.weeks_booked ?? 0 };
    }
    if (beste) uit.push({ iso: beste.iso, weeks: beste.weeks });
  }
  return uit;
}

/** YYYY-MM-DD van `dag` in Brussel, uur h → ISO in UTC. */
const YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" });
const UUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false });
export function bxlMoment(dag, h) {
  const ymd = YMD.format(dag);
  const [y, m, d] = ymd.split("-").map(Number);
  for (const off of [2, 1]) {
    const t = new Date(Date.UTC(y, m - 1, d, h - off));
    const hh = Number(UUR.format(t)) % 24;
    if (hh === h) return t.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, h - 1)).toISOString();
}

/** Huidige reeks (weken op rij) uit de 'week'-rijen van het boek. De lopende week telt nog niet mee. */
export function huidigeReeks(rijen, nu = new Date()) {
  const weken = new Set((rijen || []).filter((r) => r.kind === "week" && r.meta?.week).map((r) => r.meta.week));
  if (!weken.size) return 0;
  const vorige = isoWeek(new Date(nu.getTime() - 7 * 86400000).toISOString());
  return reeks(weken, vorige).lengte;
}

/** Eén regel voor in de deurcodemail: "🔥 6 weken op rij · Vaste klant · 312 punten". */
export async function korteStatus(admin, userId, gymId) {
  const s = await laadInstellingen(admin, gymId);
  if (!s?.aan) return null;
  const { lifetime, saldo, niveau, alle } = await puntenVan(admin, userId, { limit: 0 });
  if (!lifetime) return "Nieuw: elke sessie levert je nu punten op — 300 punten = een gratis sessie.";
  const r = huidigeReeks(alle);
  const delen = [];
  if (r >= 2) delen.push(`🔥 ${r} weken op rij`);
  delen.push(niveau.naam);
  delen.push(`${saldo} punten`);
  if (saldo >= s.prijs_sessie) delen.push("🎁 genoeg voor een gratis sessie");
  return delen.join(" · ");
}

/**
 * Het klassement van deze maand op PUNTEN (scorebord, handmatige punten en uitgaven tellen niet mee), plus
 * "meest verbeterd" tegenover vorige maand. Enkel leden, enkel wie niet uitschreef (0067), geen testaccounts.
 */
export async function klassementDezeMaand(admin, gymId) {
  const deze = beginMaand(), vorige = beginMaand(new Date(), 1);
  const [rijen, { data: prof }] = await Promise.all([
    alles(() => admin.from("member_points").select("user_id, kind, points, created_at").eq("gym_id", gymId).gte("created_at", vorige)),
    admin.from("profiles").select("id, full_name, role, leaderboard_opt_in, is_test").eq("gym_id", gymId).eq("role", "lid"),
  ]);
  const mag = new Map((prof || []).filter((p) => p.leaderboard_opt_in !== false && !p.is_test).map((p) => [p.id, p]));
  const per = new Map();
  const t0 = new Date(deze).getTime();
  for (const r of rijen) {
    if (!mag.has(r.user_id) || NIET_KLASSEMENT.has(r.kind)) continue;
    const x = per.get(r.user_id) || { naam: mag.get(r.user_id).full_name || "Lid", deze: 0, vorige: 0, sessies: 0, aangebracht: 0 };
    if (new Date(r.created_at).getTime() >= t0) {
      x.deze += r.points;
      if (r.kind === "sessie" || r.kind === "deelnemer") x.sessies++;
      if (r.kind === "vriend_eerste") x.aangebracht++;
    } else x.vorige += r.points;
    per.set(r.user_id, x);
  }
  return klassement(per);
}

export { WAARDEN, isoWeek };
