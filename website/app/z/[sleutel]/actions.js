"use server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { leesSleutel } from "@/lib/sleutel";
import { magInchecken, vorigeSessie, TAG_SET, STAAT, MAX_GAT_MS, tweeKeerRommel } from "@/lib/netheid";
import { geefNu } from "@/lib/punten-db";
import { notifyAdmins } from "@/lib/notify";
import { sendMeldingAlarm } from "@/lib/email";

// De zaalcheck uit de deurcodemail: "hoe vond je de zaal toen je binnenkwam?". Geen login — de ondertekende link
// IS de toegang, en hij werkt enkel voor déze boeking, enkel voor het lid (de coach krijgt hem niet), en enkel
// van 10 minuten vóór de start tot 2 uur na het einde.

const kort = (v, n) => String(v ?? "").trim().slice(0, n);

export async function boekingVoorCheck(sleutel) {
  const id = leesSleutel("zaal", sleutel);
  if (!id) return null;
  const admin = createAdminClient();
  const { data: b } = await admin.from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, status, promo, member:profiles!bookings_user_id_fkey(full_name)")
    .eq("id", id).maybeSingle();
  return b || null;
}

export async function bestaandeCheck(bookingId) {
  const { data } = await createAdminClient().from("zaal_checks").select("state, tags, photo_path").eq("booking_id", bookingId).maybeSingle();
  return data || null;
}

/** Stap 1: de staat. Eén tik uit de mail. Opnieuw tikken corrigeert — de vorige boeking blijft wat ze was. */
export async function bewaarZaalcheck(sleutel, state) {
  if (!STAAT[state]) return { error: "Kies netjes, niet netjes of iets stuk." };
  const b = await boekingVoorCheck(sleutel);
  if (!b) return { error: "Deze link werkt niet (meer)." };
  if (!magInchecken(b)) return { error: "De zaalcheck kan van 10 minuten vóór je sessie tot 2 uur erna." };
  const admin = createAdminClient();

  const { data: al } = await admin.from("zaal_checks").select("booking_id, state").eq("booking_id", b.id).maybeSingle();
  if (al) {
    const { error } = await admin.from("zaal_checks").update({ state, updated_at: new Date().toISOString() }).eq("booking_id", b.id);
    if (error) return { error: "Bewaren lukte niet. Probeer het opnieuw." };
  } else {
    // Wie zat er vóór? Nu vastleggen: later kan een boeking verplaatst of geannuleerd worden.
    const van = new Date(new Date(b.starts_at).getTime() - MAX_GAT_MS).toISOString();
    const { data: eerder } = await admin.from("bookings").select("id, user_id, coach_id, ends_at")
      .eq("gym_id", b.gym_id).eq("status", "bevestigd").gte("ends_at", van).lte("ends_at", b.starts_at).neq("id", b.id);
    const v = vorigeSessie(b, eerder || []);
    const { error } = await admin.from("zaal_checks").insert({
      booking_id: b.id, gym_id: b.gym_id, user_id: b.user_id, state,
      previous_booking: v?.booking || null, previous_kind: v?.kind || null, previous_user: v?.user || null,
    });
    if (error && error.code !== "23505") return { error: "Bewaren lukte niet. Probeer het opnieuw." };
  }

  const punten = await geefNu(admin, { gymId: b.gym_id, userId: b.user_id, kind: "zaalcheck", sourceKey: `zaalcheck:${b.id}`, meta: { booking: b.id } })
    .catch(() => 0);

  // Twee keer na elkaar "niet netjes" → de uitbater hoort het meteen (een belletje, geen mail).
  if (state === "rommel") {
    const { data: laatste } = await admin.from("zaal_checks").select("state").eq("gym_id", b.gym_id).order("created_at", { ascending: false }).limit(2);
    if (tweeKeerRommel(laatste || [])) {
      await notifyAdmins({ gymId: b.gym_id, type: "system", title: "🧼 Twee keer na elkaar: zaal niet netjes", body: "Bekijk wie er telkens vóór zat.", link: "/beheer/netheid" });
    }
  }
  return { ok: true, state, punten };
}

/** Stap 2 (optioneel): wat precies, een foto, en bij 'stuk' een woordje uitleg. */
export async function voegDetailsToe(formData) {
  const sleutel = formData.get("sleutel");
  const b = await boekingVoorCheck(sleutel);
  if (!b || !magInchecken(b)) return { error: "Deze link werkt niet (meer)." };
  const admin = createAdminClient();
  const { data: check } = await admin.from("zaal_checks").select("state, photo_path").eq("booking_id", b.id).maybeSingle();
  if (!check) return { error: "Tik eerst hoe je de zaal vond." };

  const tags = formData.getAll("tags").map((t) => kort(t, 20)).filter((t) => TAG_SET.has(t)).slice(0, 7);
  const uitleg = kort(formData.get("uitleg"), 1000);

  // Foto: dezelfde privébak als het meldpunt, zelf hercomprimeerd (EXIF-rotatie, ±150 KB).
  let photoPath = check.photo_path;
  const foto = formData.get("photo");
  if (foto && typeof foto !== "string" && foto.size > 0 && foto.size <= 8 * 1024 * 1024) {
    try {
      const buf = await sharp(Buffer.from(await foto.arrayBuffer()))
        .rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 }).toBuffer();
      const pad = `${b.gym_id}/zaal/${b.id}-${Date.now()}.webp`;
      const { error } = await admin.storage.from("meldingen").upload(pad, buf, { contentType: "image/webp", upsert: false });
      if (!error) photoPath = pad;
    } catch { /* zonder foto verder */ }
  }

  const { error } = await admin.from("zaal_checks").update({ tags, photo_path: photoPath, updated_at: new Date().toISOString() }).eq("booking_id", b.id);
  if (error) return { error: "Bewaren lukte niet." };

  let punten = 0;
  if (photoPath && check.state !== "netjes") {
    punten = await geefNu(admin, { gymId: b.gym_id, userId: b.user_id, kind: "zaalfoto", sourceKey: `zaalfoto:${b.id}`, meta: { booking: b.id } }).catch(() => 0);
  }

  // Iets stuk raakt de volgende bezoeker: dat wordt ook een melding in het meldpunt, met mail naar de uitbater
  // (dezelfde route als "toestel stuk" vanuit het meldpunt).
  if (check.state === "stuk" && (uitleg || photoPath)) {
    const naam = b.member?.full_name || "een lid";
    const bericht = uitleg || "Iets stuk gemeld bij de zaalcheck";
    const { data: al } = await admin.from("problem_reports").select("id").eq("booking_id", b.id).eq("page", "/z").maybeSingle();
    if (!al) {
      const { error: pe } = await admin.from("problem_reports").insert({ gym_id: b.gym_id, user_id: b.user_id, booking_id: b.id, category: "toestel", message: bericht, page: "/z", photo_path: photoPath });
      if (pe) console.error("zaalcheck → meldpunt:", pe.message);
      try {
        const { data: admins } = await admin.from("profiles").select("email").eq("gym_id", b.gym_id).eq("role", "beheerder");
        await sendMeldingAlarm({ to: (admins || []).map((a) => a.email).filter(Boolean), categorie: "Toestel stuk", melder: naam, bericht, wanneer: b.starts_at, metFoto: !!photoPath, vorige: null });
        await notifyAdmins({ gymId: b.gym_id, type: "system", title: `🔧 Iets stuk — gemeld door ${naam}`, body: bericht.slice(0, 90), link: "/beheer/meldingen" });
      } catch { /* de melding staat er; een mislukte mail mag dat niet terugdraaien */ }
    }
  }
  return { ok: true, punten };
}
