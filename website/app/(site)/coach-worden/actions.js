"use server";
import crypto from "crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCoachApplyConfirmation, sendCoachApplyNotice } from "@/lib/email";
import { FORWARD_TO } from "@/lib/inbox";
import { notify } from "@/lib/notify";
import { keurCv, keurFoto, leeg, opslagPad, veiligeBestandsnaam } from "@/lib/coach-aanmelding";

// Publieke coach-aanmelding vanaf /coach-worden — zelfde patroon als de PT-intake: werkt zonder
// account (een coach die hier solliciteert ís nog geen gebruiker), landt als bericht in de
// beheer-Inbox, pingt de beheerders in-app, gaat door naar de eigenaarsmailbox met
// reply-to = de kandidaat, en bevestigt aan de kandidaat.
export async function applyAsCoach(formData) {
  // Honeypot: bots vullen elk veld in, mensen zien dit veld nooit. Stil accepteren en laten vallen.
  if (String(formData.get("website") || "").trim()) return { ok: true, already: true, message: "We hebben je aanmelding goed ontvangen." };

  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  const phone = String(formData.get("phone") || "").trim().slice(0, 40);
  const specialty = String(formData.get("specialty") || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const about = String(formData.get("about") || "").trim().slice(0, 2000);
  const socials = String(formData.get("socials") || "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (!name) return { error: "Vul je naam in." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Vul een geldig e-mailadres in." };
  if (about.length < 20) return { error: "Vertel iets meer over jezelf — een paar zinnen volstaan." };

  // Bijlagen keuren VOOR er iets weggeschreven wordt. Een afgekeurd bestand hoort een duidelijke
  // melding te geven waarna de kandidaat opnieuw kan versturen, niet een half opgeslagen aanmelding.
  // Het meegestuurde MIME-type is een bewering van de indiener; voor de pdf kijken we daarom naar
  // de eerste bytes (zie lib/coach-aanmelding.js).
  const cvFile = formData.get("cv");
  const fotoFile = formData.get("photo");
  const cvBytes = leeg(cvFile) ? null : Buffer.from(await cvFile.arrayBuffer());
  const cvKeuring = keurCv(cvFile, cvBytes);
  if (cvKeuring.error) return { error: cvKeuring.error };
  const fotoKeuring = keurFoto(fotoFile);
  if (fotoKeuring.error) return { error: fotoKeuring.error };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Er ging iets mis. Probeer het later opnieuw." };

  // Anti-misbruik: max 2 aanmeldingen per e-mailadres per dag. De rem telt op het onderwerp van de
  // inbound-rij, dus dat voorvoegsel mag nooit veranderen.
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("from_email", email)
    .ilike("subject", "Coach-aanmelding%")
    .gte("created_at", since);
  if ((count || 0) >= 2) return { ok: true, already: true, message: "We hebben je aanmelding al — we contacteren je snel." };

  const bijlagen = [cvKeuring.bestand ? "cv (pdf)" : "", fotoKeuring.bestand ? "foto" : ""].filter(Boolean);
  const details = [
    specialty ? `Specialiteit: ${specialty}` : "",
    socials ? `Website / socials: ${socials}` : "",
    bijlagen.length ? `Bijlagen: ${bijlagen.join(" + ")} — te openen in Beheer → Inbox` : "",
  ].filter(Boolean).join("\n");
  const text = `${details ? `${details}\n\n` : ""}Naam: ${name}\nE-mail: ${email}${phone ? `\nTelefoon: ${phone}` : ""}\n\nOver de kandidaat:\n${about}`;

  const { data: mail, error: insErr } = await admin.from("inbound_emails").insert({
    gym_id: gym.id,
    resend_id: `coach-apply-${crypto.randomUUID()}`, // synthetisch id — geen echte Resend-mail
    from_email: email,
    from_name: name,
    to_email: "coaches@fittin.be",
    subject: `Coach-aanmelding — ${name}`,
    text_body: text,
    received_at: new Date().toISOString(),
  }).select("id").single();
  if (insErr) { console.error("coach apply insert:", insErr.message); return { error: "Er ging iets mis. Probeer het later opnieuw." }; }

  // Nu pas uploaden. De aanmelding staat al vast, dus een storing bij de opslag kost de kandidaat
  // zijn sollicitatie niet — hij hoort het wel, zodat hij het bestand kan nasturen in plaats van
  // te denken dat het aangekomen is.
  let opslagMislukt = false;
  const bewaar = async (soort, buf, mime, ext, oorspronkelijkeNaam) => {
    const pad = opslagPad(gym.id, `${mail.id}-${crypto.randomUUID().slice(0, 8)}`, soort, ext);
    const { error } = await admin.storage.from("coach-aanmeldingen").upload(pad, buf, { contentType: mime, upsert: false });
    if (error) { console.error(`coach apply upload ${soort}:`, error.message); opslagMislukt = true; return; }
    const { error: rijErr } = await admin.from("coach_application_files").insert({
      gym_id: gym.id, inbound_email_id: mail.id, soort, pad, mime, bytes: buf.length,
      bestandsnaam: veiligeBestandsnaam(oorspronkelijkeNaam, soort === "cv" ? "cv.pdf" : "foto.webp"),
    });
    // Een bestand zonder rij is onvindbaar voor de beheerder; ruim het dan meteen op in plaats van
    // een wees in de bak te laten staan.
    if (rijErr) {
      console.error("coach apply file row:", rijErr.message);
      opslagMislukt = true;
      try { await admin.storage.from("coach-aanmeldingen").remove([pad]); } catch {}
    }
  };

  if (cvKeuring.bestand && cvBytes) {
    await bewaar("cv", cvBytes, "application/pdf", "pdf", cvKeuring.bestand.name);
  }
  if (fotoKeuring.bestand) {
    // Hercoderen met sharp doet twee dingen tegelijk: het bewijst dat het echt een afbeelding is,
    // en het strippt de EXIF-gegevens — een sollicitatiefoto draagt anders de locatie mee waar ze
    // genomen is. Lukt het niet, dan was het geen bruikbare foto.
    try {
      const buf = await sharp(Buffer.from(await fotoKeuring.bestand.arrayBuffer()))
        .rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }).toBuffer();
      await bewaar("foto", buf, "image/webp", "webp", fotoKeuring.bestand.name);
    } catch (e) { console.error("coach apply foto:", e?.message); opslagMislukt = true; }
  }

  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", gym.id).eq("role", "beheerder");
    const body = [specialty, about].filter(Boolean).join(" · ").slice(0, 140) || email;
    for (const a of admins || []) {
      await notify({ gymId: gym.id, userId: a.id, type: "system", title: `Nieuwe coach-aanmelding: ${name}`, body, link: "/beheer/inbox" });
    }
  } catch (e) { console.error("coach apply notify:", e?.message); }
  try { await sendCoachApplyNotice({ to: FORWARD_TO, applicantName: name, applicantEmail: email, phone, specialty, socials, about, bijlagen }); } catch (e) { console.error("coach apply notice:", e?.message); }
  try { await sendCoachApplyConfirmation({ to: email, name }); } catch (e) { console.error("coach apply confirmation:", e?.message); }

  // Alleen bij een echte storing wijkt de tekst af. Zwijgen zou de kandidaat laten denken dat zijn
  // cv aangekomen is, en dat merkt hij pas als er nooit iets mee gebeurt.
  if (opslagMislukt) {
    return { ok: true, message: "We hebben je aanmelding goed ontvangen, maar je bijlage raakte niet opgeslagen. Mail ze gerust na naar info@fittin.be." };
  }
  return { ok: true, message: "We hebben je aanmelding goed ontvangen." };
}
