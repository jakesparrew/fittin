"use server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendIntakeConfirmation, sendIntakeNotice } from "@/lib/email";
import { FORWARD_TO } from "@/lib/inbox";
import { notify } from "@/lib/notify";
import { isUuid } from "@/lib/slug";
import { beschikbaarheidZin, FORMULES } from "./options";

// Public "gratis intake & proeftraining" request — the redeem path for every PT CTA. Works without
// an account (PT prospects are usually not members yet). The request lands in the superadmin Inbox
// (as a normal customer message), pings the beheerders in-app, forwards to the owner mailbox with
// reply-to = prospect, and confirms to the prospect.
export async function requestIntake(formData) {
  // Honeypot: bots fill every field; humans never see this one. Silently accept + drop.
  if (String(formData.get("website") || "").trim()) return { ok: true, already: true, message: "We hebben je aanvraag goed ontvangen." };

  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  const phone = String(formData.get("phone") || "").trim().slice(0, 40);
  const goal = String(formData.get("goal") || "").trim().slice(0, 2000);
  // `when` is de vrije nalijn onder de chips. De \s+-collapse is defensief: deze string belandt in
  // een e-mailtabelrij en in een notify-body die allebei op één regel renderen, zonder pre-wrap.
  const when = String(formData.get("when") || "").trim().replace(/\s+/g, " ").slice(0, 200);
  const rawFormule = String(formData.get("formule") || "").trim();
  const formule = FORMULES.includes(rawFormule) ? rawFormule : "";
  const coachId = String(formData.get("coachId") || "").trim();

  // Beschikbaarheid. Let op getAll(): de dagen komen als meerdere entries onder dezelfde sleutel
  // binnen, dus met get() zou stilzwijgend alles behalve de eerste dag verdwijnen. De whitelist,
  // de ontdubbeling, de vaste ma→zo-volgorde én de lengtelimiet zitten in beschikbaarheidZin(),
  // dat over de constante filtert i.p.v. over de invoer — dezelfde verdediging als
  // FORMULES.includes() hierboven, doorgetrokken naar meervoudige waarden.
  const beschikbaar = beschikbaarheidZin(formData.get("dagdeel"), formData.getAll("dagen"));
  // Eén zin voor alle weergaveplekken. `beschikbaar` staat vooraan zodat hij elke afkapping
  // overleeft; de vrije nalijn leest daarachter als verfijning, niet als concurrent.
  const kan = [beschikbaar, when].filter(Boolean).join(" — ");

  if (!name) return { error: "Vul je naam in." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Vul een geldig e-mailadres in." };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
  if (!gym) return { error: "Er ging iets mis. Probeer het later opnieuw." };

  // Anti-abuse: max 3 requests per e-mail address per day.
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("from_email", email)
    .ilike("subject", "PT-intake%")
    .gte("created_at", since);
  // `already` onderdrukt de bevestigingstekst in het formulier: er vertrekt hier geen mail meer.
  if ((count || 0) >= 3) return { ok: true, already: true, message: "We hebben je aanvraag al — we contacteren je snel." };

  // De coach komt als id binnen, nooit als vrije tekst: de naam halen we zelf op, en alleen bij een
  // publiek coachprofiel. Zo kan niemand een willekeurige naam in de inbox van de eigenaar schrijven.
  let coachName = "";
  let coach = null;
  if (isUuid(coachId)) {
    const { data: co } = await admin
      .from("profiles")
      .select("id, full_name, email, is_test")
      .eq("id", coachId)
      .eq("gym_id", gym.id)
      .eq("role", "coach")
      .eq("coach_public", true)
      // Neemt die coach geen nieuwe klanten aan, dan behandelen we dit verder als een aanvraag
      // zónder voorkeur: geen melding en geen mail naar hem, en zijn naam niet in de inboxtekst.
      // De aanvraag zelf komt gewoon binnen bij Fittin', dat zelf beslist wie ze aanspreken.
      .eq("coach_accepting_clients", true)
      .maybeSingle();
    coachName = co?.full_name || "";
    coach = co || null;
  }

  // Twee varianten, bewust: de MAIL krijgt "Kan" als eigen tabelrij bovenaan en mag hem dus niet
  // ook nog in het tekstblok herhalen. De inboxrij heeft geen tabel en zet hem vooraan in de tekst.
  const mailDetails = [
    formule ? `Formule: ${formule}` : "",
    coachName ? `Voorkeurcoach: ${coachName}` : "",
  ].filter(Boolean).join("\n");
  const goalBlock = `${mailDetails ? `${mailDetails}\n\n` : ""}Doel / vraag:\n${goal || "(niet ingevuld)"}`;

  // text_body: beschikbaarheid als eerste regel. De inboxlijst toont enkel de eerste 120 tekens na
  // een \s+-collapse (beheer/inbox/page.jsx:100); dat budget ging tot nu volledig op aan
  // "Naam: … E-mail: …" — gegevens die in diezelfde rij al links staan. Het detailscherm valt altijd
  // in de <pre whitespace-pre-wrap>-tak, want deze insert schrijft geen html_body.
  const kop = [
    kan ? `Kan: ${kan}` : "",
    formule ? `Formule: ${formule}` : "",
    coachName ? `Voorkeurcoach: ${coachName}` : "",
  ].filter(Boolean).join("\n");
  const text = `${kop ? `${kop}\n\n` : ""}Naam: ${name}\nE-mail: ${email}${phone ? `\nTelefoon: ${phone}` : ""}\n\nDoel / vraag:\n${goal || "(niet ingevuld)"}`;
  const { error: insErr } = await admin.from("inbound_emails").insert({
    gym_id: gym.id,
    resend_id: `intake-${crypto.randomUUID()}`, // synthetic id — not a Resend message
    from_email: email,
    from_name: name,
    to_email: "intake@fittin.be",
    subject: `PT-intake aanvraag — ${name}`,
    text_body: text,
    received_at: new Date().toISOString(),
  });
  if (insErr) { console.error("intake insert:", insErr.message); return { error: "Er ging iets mis. Probeer het later opnieuw." }; }

  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", gym.id).eq("role", "beheerder");
    // Beschikbaarheid vooraan: deze body wordt op 140 tekens gekapt en stond er tot nu helemaal
    // niet in — `when` zat nooit in deze regel. NotifItem rendert hem in een gewone <p> zonder
    // pre-wrap, dus dit moet één regel blijven met "·" als scheider.
    const body = [kan, formule, coachName ? `voorkeur ${coachName}` : "", goal].filter(Boolean).join(" · ").slice(0, 140) || email;
    for (const a of admins || []) {
      await notify({ gymId: gym.id, userId: a.id, type: "system", title: `Nieuwe PT-intake: ${name}`, body, link: "/beheer/inbox" });
    }
  } catch (e) { console.error("intake notify:", e?.message); }

  // Vroeg een client een specifieke coach aan, dan hoort die coach het RECHTSTREEKS te weten — niet
  // alleen de beheerder. Tot nu ging elke intake enkel naar Fittin, zodat een coach zijn eigen lead
  // pas hoorde als de eigenaar het doorgaf. De coach krijgt nu een in-app melding én dezelfde mail
  // die de eigenaar krijgt (reply-to = de prospect), zodat hij meteen kan antwoorden. De prospect
  // koos deze coach zelf uit, dus zijn contactgegevens delen met net die coach is verwacht.
  if (coach?.id && !coach.is_test) {
    try {
      await notify({ gymId: gym.id, userId: coach.id, type: "system", title: `Nieuwe intake-aanvraag voor jou: ${name}`, body: [beschikbaar, goal].filter(Boolean).join(" · ").slice(0, 140) || email, link: "/coach" });
    } catch (e) { console.error("intake coach notify:", e?.message); }
    if (coach.email) {
      try { await sendIntakeNotice({ to: coach.email, prospectName: name, prospectEmail: email, phone, kan, beschikbaar, goal: goalBlock }); } catch (e) { console.error("intake coach notice:", e?.message); }
    }
  }
  // `beschikbaar` gaat apart mee omdat alleen díé string in het onderwerp mag: ze bestaat
  // uitsluitend uit constanten uit options.js. `kan` bevat ook de vrije nalijn en blijft in de body.
  try { await sendIntakeNotice({ to: FORWARD_TO, prospectName: name, prospectEmail: email, phone, kan, beschikbaar, goal: goalBlock }); } catch (e) { console.error("intake notice:", e?.message); }
  try { await sendIntakeConfirmation({ to: email, name }); } catch (e) { console.error("intake confirmation:", e?.message); }

  return { ok: true, message: "We hebben je aanvraag goed ontvangen." };
}
