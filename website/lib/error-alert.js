import { classifyClientError } from "@/lib/error-triage";
import { sendErrorAlert } from "@/lib/email";

// Nieuwe app-fouten meteen per mail melden, vanuit de 5-minutencron.
//
// Waarom: Laura's boekingsfout stond een halve dag zichtbaar in de foutlogs voor iemand keek.
// Een lijst is een archief, een mail is een alarm. Enkel échte app-fouten alarmeren — een lid
// dat in de lift zijn verbinding verliest is geen storing, en een vals alarm per dag leert de
// ontvanger het alarm te negeren (zelfde reden waarom de batterijmail getrapt is).
//
// Dedupe op fout-groep (melding + pagina): tien voorvallen van dezelfde fout = één mail, met de
// teller erin. Alles wat meegenomen is krijgt alerted_at, ook de ruis — die willen we niet elke
// vijf minuten opnieuw doorlopen.
//
// ONTVANGERS: enkel de ontwikkelaar (owner-beslissing 2026-08-11). Dit gebruikte eerst
// LOCK_ALERT_EMAILS — de lijst van de deurslot-batterij — waardoor een JS-stacktrace bij de
// gym-uitbater belandde. Die kan er niets mee, en een alarm dat je niet kan behandelen leer je
// negeren; dan mis je óók de batterijmail die wél voor hem is. Twee soorten alarm, twee lijsten.
export const RECIPIENTS = (process.env.ERROR_ALERT_EMAILS || "gaetanjansseune@gmail.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

export async function alertNewClientErrors(admin) {
  const { data: rows } = await admin
    .from("client_errors")
    .select("id, message, stack, path, created_at, user_id")
    .is("alerted_at", null).is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!rows || !rows.length) return { alerted: 0, swallowed: 0 };

  // Namen erbij: "1 gebruiker" is een statistiek, "Laura Martens" is een klant die je kan helpen
  // vóór ze moet mailen.
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const nameById = {};
  if (userIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name, email").in("id", userIds);
    for (const p of profs || []) nameById[p.id] = p.full_name || p.email || "lid";
  }

  const groups = new Map();
  for (const r of rows) {
    if (classifyClientError(r.message, r.stack) !== "app") continue;
    const key = `${r.message}|${r.path}`;
    if (!groups.has(key)) groups.set(key, { message: r.message, path: r.path, stack: r.stack, count: 0, users: new Set(), first: r.created_at });
    const g = groups.get(key);
    g.count++;
    if (r.user_id) g.users.add(r.user_id);
  }

  let alerted = 0;
  for (const g of groups.values()) {
    const wie = [...g.users].map((id) => nameById[id]).filter(Boolean);
    for (const to of RECIPIENTS) {
      await sendErrorAlert({
        to,
        message: g.message,
        path: g.path,
        stack: g.stack,
        count: g.count,
        userNames: wie,
        firstSeen: g.first,
      });
    }
    alerted++;
  }

  // Alles markeren, ook ruis: anders scant elke cronbeurt dezelfde rijen opnieuw.
  await admin.from("client_errors").update({ alerted_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
  return { alerted, swallowed: rows.length - alerted };
}
