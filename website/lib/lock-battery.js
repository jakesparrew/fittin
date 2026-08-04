import { getNukiConfig, getLockBattery } from "@/lib/nuki";
import { sendLockBatteryAlert } from "@/lib/email";

// Batterijbewaking van het deurslot.
//
// Een leeg slot legt de hele zaak plat: geen enkele code werkt nog, en dat merk je pas als er
// iemand voor een dichte deur staat. Nuki stuurt zelf een push naar de app van wie het slot
// beheert, maar dat is één persoon en één kanaal — daarom mailen we het ook.
//
// GETRAPT waarschuwen (30 → 20 → 10 → kritiek), één mail per drempel. Elke dag hetzelfde bericht
// sturen leert mensen het te negeren, en dan missen ze net de laatste. Zakt het niveau een trede,
// dan volgt er een nieuwe (dringendere) mail.
const TIERS = [30, 20, 10];
const TIER_MAX = Math.max(...TIERS);

// Ontvangers: bewust twee adressen (één bedrijfsadres + één persoonlijk) en elk apart verstuurd,
// zodat een suppressie of spamfilter op het ene adres het andere niet meesleept.
const RECIPIENTS = (process.env.LOCK_ALERT_EMAILS || "info@fittin.be,ran.knockaert@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Welke drempel hoort bij dit percentage? 0 = kritiek, null = alles in orde.
export function tierFor(pct, critical) {
  if (critical) return 0;
  if (pct == null) return null;
  // De ERNSTIGSTE overschreden drempel, niet de eerste de beste. Bij 11% zijn zowel 30 als 20
  // overschreden; geef je dan 30 terug, dan lijkt er niets veranderd sinds de eerste mail en
  // escaleert de reeks nooit — de batterij gaat stil leeg.
  const crossed = TIERS.filter((t) => pct <= t);
  return crossed.length ? Math.min(...crossed) : null;
}

// Pure beslissing: moet deze meting een mail worden, en wat onthouden we dan?
// Apart gehouden omdat dit precies het stuk is dat stil kan ontsporen — ofwel elke dag spammen
// (tot niemand het nog leest), ofwel nooit vuren. Getest in lock-battery.test.js.
//   `already` = laagste drempel waarvoor al gemaild is (0 = kritiek, null = nog niets).
export function decide(bat, already) {
  // Een leeg keypad is door-kritiek ongeacht hoe vol het slot zélf zit: valt dat paneel uit, dan
  // werkt geen enkele code meer. Daarom vóór alle percentage-logica — anders viel dit geval door
  // de "alles in orde"-afslag heen bij een volle slotbatterij.
  if (bat.keypadCritical) {
    return already === 0 ? { reset: false, alert: false } : { reset: false, alert: true, newTier: 0 };
  }

  const tier = tierFor(bat.percent, bat.critical);

  // Batterijen vervangen: weer ruim boven de hoogste drempel. Marge van 5 punten zodat een meting
  // die rond de grens heen en weer schommelt de reeks niet telkens herstart.
  if (tier == null && bat.percent != null && bat.percent > TIER_MAX + 5) {
    return { reset: already != null, alert: false };
  }
  if (tier == null) return { reset: false, alert: false };

  // Alleen als het ERGER is dan wat we al meldden (lager getal = erger, 0 = kritiek).
  if (!(already == null || tier < already)) return { reset: false, alert: false };
  return { reset: false, alert: true, newTier: tier };
}

export async function checkLockBatteries(admin, now = new Date()) {
  const { data: rows } = await admin
    .from("gym_integrations")
    .select("gym_id, battery_alert_tier, gyms(name)")
    .eq("nuki_enabled", true);

  let checked = 0, alerted = 0;
  for (const row of rows || []) {
    const cfg = await getNukiConfig(admin, row.gym_id);
    if (!cfg.enabled) continue;
    const bat = await getLockBattery(cfg);
    if (!bat.ok) continue; // slot onbereikbaar → geen meting, niets melden (de cron flagt dat al apart)
    checked++;

    await admin.from("gym_integrations").update({
      battery_pct: bat.percent,
      battery_keypad_critical: !!bat.keypadCritical,
      battery_checked_at: now.toISOString(),
    }).eq("gym_id", row.gym_id);

    const d = decide(bat, row.battery_alert_tier);
    if (d.reset) {
      await admin.from("gym_integrations").update({ battery_alert_tier: null }).eq("gym_id", row.gym_id);
      continue;
    }
    if (!d.alert) continue;

    for (const to of RECIPIENTS) {
      await sendLockBatteryAlert({
        to,
        gymName: row.gyms?.name || "Fittin'",
        percent: bat.percent,
        critical: bat.critical,
        keypadCritical: bat.keypadCritical,
      });
    }
    await admin.from("gym_integrations").update({ battery_alert_tier: d.newTier }).eq("gym_id", row.gym_id);
    alerted++;
  }
  return { checked, alerted };
}
