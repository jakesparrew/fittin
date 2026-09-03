"use server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { sendMeldingAlarm } from "@/lib/email";
import { CATEGORIEEN, catLabel, isUrgent, teVeelGemeld, vorigeGebruiker } from "@/lib/meldpunt";

// Melden vanuit de deurcodemail. Geen login: het token IS de toegangscontrole, en het hangt aan één
// boeking — dus het verloopt vanzelf mee met de sessie en opent nooit meer dan één melding over
// één uur. Dat is bewust een lagere drempel dan inloggen: het alternatief is de huidige situatie,
// waarin er in vijf maanden één melding binnenkwam.

const GELDIG = new Set(CATEGORIEEN.map((c) => c.v));
const kort = (v, n) => String(v ?? "").trim().slice(0, n);

// Het venster waarin een token werkt: vanaf een uur vóór de sessie tot vier dagen erna. Daarbuiten
// is de link dood. Zonder venster blijft elk token dat ooit in een mailbox belandde eeuwig geldig.
const VROEGST_MIN = 60;
const LAATST_UREN = 96;

export async function tokenGeldig(token) {
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, status, services(name), member:profiles!bookings_user_id_fkey(full_name)")
    .eq("report_token", kort(token, 64))
    .maybeSingle();
  if (!b || b.status !== "bevestigd") return null;
  const start = new Date(b.starts_at).getTime();
  const nu = Date.now();
  if (nu < start - VROEGST_MIN * 60000) return null;
  if (nu > new Date(b.ends_at).getTime() + LAATST_UREN * 3600000) return null;
  return b;
}

export async function meldViaToken(formData) {
  const admin = createAdminClient();
  const b = await tokenGeldig(formData.get("token"));
  if (!b) return { error: "Deze link is verlopen. Meld het via je account of mail info@fittin.be." };

  const category = kort(formData.get("category"), 20);
  if (!GELDIG.has(category)) return { error: "Kies eerst waar het over gaat." };
  const message = kort(formData.get("message"), 2000);

  if (await teVeelGemeld(admin, b.user_id)) {
    return { error: "Je stuurde al een aantal meldingen vandaag. Bel ons even als het dringend is." };
  }

  // Foto: privébak, en we hercomprimeren zelf. Een telefoonfoto van 5 MB wordt ±150 KB, met de
  // juiste kant naar boven (EXIF). Mislukt dat, dan gaat de melding gewoon door zonder foto — een
  // kapotte upload mag nooit een melding tegenhouden.
  let photoPath = null;
  const foto = formData.get("photo");
  if (foto && typeof foto !== "string" && foto.size > 0 && foto.size <= 8 * 1024 * 1024) {
    try {
      const buf = await sharp(Buffer.from(await foto.arrayBuffer()))
        .rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 }).toBuffer();
      const pad = `${b.gym_id}/${b.id}-${Date.now()}.webp`;
      const { error } = await admin.storage.from("meldingen").upload(pad, buf, { contentType: "image/webp", upsert: false });
      if (!error) photoPath = pad;
    } catch { /* zonder foto verder */ }
  }

  const { data: rij, error: e } = await admin.from("problem_reports").insert({
    gym_id: b.gym_id,
    user_id: b.user_id,
    booking_id: b.id,
    category,
    message: message || catLabel(category),
    page: "/m",
    photo_path: photoPath,
  }).select("id").single();
  if (e) return { error: "Versturen lukte niet. Probeer het opnieuw." };

  const naam = b.member?.full_name || "een lid";
  // Belletje bij elke beheerder — altijd. Mail alleen bij toestel/deur: dat raakt de volgende
  // bezoeker meteen. Bij netheid of temperatuur is een belletje genoeg; anders leert de eigenaar
  // het alarm te negeren, en dan werkt het ook niet meer wanneer het écht moet.
  try {
    const { data: admins } = await admin.from("profiles").select("id, email").eq("gym_id", b.gym_id).eq("role", "beheerder");
    for (const a of admins || []) {
      await notify({
        gymId: b.gym_id, userId: a.id, actorId: b.user_id, type: "system",
        title: `🛟 ${catLabel(category)} — gemeld door ${naam}`,
        body: message.slice(0, 90) || "geen extra uitleg",
        link: "/beheer/meldingen",
      });
    }
    if (isUrgent(category)) {
      const vorige = category === "netheid" ? await vorigeGebruiker(admin, b.gym_id, b.starts_at, b.id) : null;
      await sendMeldingAlarm({
        to: (admins || []).map((a) => a.email).filter(Boolean),
        categorie: catLabel(category), melder: naam, bericht: message,
        wanneer: b.starts_at, metFoto: !!photoPath, vorige,
      });
    }
  } catch { /* een mislukte melding-melding mag de melding zelf niet ongedaan maken */ }

  return { ok: true, id: rij.id };
}
