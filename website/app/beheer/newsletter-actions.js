"use server";
import { revalidatePath } from "next/cache";
import { nagekeken, leesbareFout } from "@/lib/uitkomst";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueNewsletter, enrollSubscriberInDrips } from "@/lib/newsletter";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
function kickWorker() {
  const secret = process.env.CRON_SECRET;
  after(async () => {
    try {
      await fetch(`${SITE}/api/queue/process`, {
        cache: "no-store",
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
    } catch {}
  });
}

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// ---------------- Newsletters ----------------
export async function createNewsletter(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const { data, error: e } = await supabase
    .from("campaigns")
    .insert({
      gym_id: profile.gym_id,
      kind: "newsletter",
      name: formData.get("name") || "Naamloze nieuwsbrief",
      subject: formData.get("subject") || "",
      preheader: formData.get("preheader") || "",
      body_html: formData.get("body") || "",
      created_by: userId,
    })
    .select("id")
    .single();
  if (e) return { error: leesbareFout(e, "Aanmaken") };
  redirect(`/beheer/nieuwsbrief/${data.id}`);
}

export async function updateNewsletter(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const res = await supabase
    .from("campaigns")
    .update({
      name: formData.get("name"),
      subject: formData.get("subject"),
      preheader: formData.get("preheader"),
      body_html: formData.get("body"),
    }, { count: "exact" })
    .eq("id", id)
    .eq("status", "draft");
  // .eq("status", "draft"): een verstuurde nieuwsbrief wijzig je niet meer. Dat gaf nul rijen en
  // toch "Opgeslagen ✓" — nu zegt het scherm waarom er niets veranderde.
  if (res.count === 0 && !res.error) return { error: "Niet opgeslagen: deze nieuwsbrief is al verstuurd of bestaat niet meer." };
  const fout = nagekeken(res, "Nieuwsbrief opslaan");
  if (fout) return fout;
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  return { ok: true, message: "Nieuwsbrief opgeslagen ✓" };
}

export async function sendNewsletter(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const { data: own } = await supabase.from("campaigns").select("id").eq("id", id).maybeSingle(); // RLS scopes to gym
  if (!own) return { error: "Onbekende campagne." };
  const res = await queueNewsletter(id); // fast: just queues
  if (res.error) return res;
  kickWorker(); // drain in paced background batches
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  revalidatePath("/beheer/nieuwsbrief");
  return { ...res, queued: res.queued, message: `${res.queued} mails in de wachtrij — ze vertrekken in porties, volg het hieronder ✓` };
}

export async function deleteCampaign(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const fout = nagekeken(await supabase.from("campaigns").delete({ count: "exact" }).eq("id", formData.get("id")), "Campagne verwijderen");
  if (fout) return fout;
  revalidatePath("/beheer/nieuwsbrief");
  redirect("/beheer/nieuwsbrief");
}

// ---------------- Drip sequences ----------------
export async function createDrip(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const { data, error: e } = await supabase
    .from("campaigns")
    .insert({ gym_id: profile.gym_id, kind: "drip", name: formData.get("name") || "Nieuwe drip", status: "draft", created_by: userId })
    .select("id")
    .single();
  if (e) return { error: leesbareFout(e, "Aanmaken") };
  redirect(`/beheer/nieuwsbrief/${data.id}`);
}

// One-click premade "Fittin' onboarding" drip — a converting sequence that introduces every
// feature (boeken, buddies, personal training, abonnement, community) over ~2 weeks.
export async function createOnboardingDrip() {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  const btn = (href, label) => `<p style="margin:18px 0"><a href="${site}${href}" style="background:#5fda6b;color:#22194f;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">${label}</a></p>`;
  const steps = [
    { delay_hours: 0, subject: "Welkom bij Fittin' 👋 — je eerste sessie is gratis", body_html: `<p>Welkom! Bij Fittin' reserveer je de privégym helemaal voor jezelf (of met vrienden) — elke dag van 6u tot 23u, boekbaar per halfuur, € 15 voor een uur en <strong>géén lidgeld</strong>. Je <strong>eerste sessie is gratis</strong> — ze wordt automatisch verrekend bij je eerste boeking, je hoeft geen code in te vullen.</p><p>Zo kom je binnen: een paar minuten voor je sessie krijg je een <strong>persoonlijke deurcode</strong> (per mail én in de app), of je opent de deur met de knop in je account.</p>${btn("/boeken", "Boek je gratis sessie")}` },
    { delay_hours: 48, subject: "Er zit een complete trainingsapp in je account 💪", body_html: `<p>Fittin' is meer dan een zaal — in je account zit een volledige trainingsapp:</p><ul style="font-size:16px;line-height:1.6;color:#2b2550;padding-left:20px"><li><strong>~800 oefeningen</strong> met demo's en uitleg</li><li>kant-en-klare <strong>workouts</strong> met video én rusttimer</li><li>maak je eigen <strong>trainingsschema</strong></li><li>log je trainingen en volg je <strong>PR's</strong></li></ul>${btn("/workouts", "Ontdek de workouts")}` },
    { delay_hours: 120, subject: "Train nooit alleen — neem vrienden mee 🤝", body_html: `<p>Samen trainen houdt je gemotiveerd. Neem tot <strong>4 personen</strong> mee in dezelfde boeking, zonder meerkost per persoon.</p><p>Voeg vrienden toe als buddy, klim op het <strong>leaderboard</strong>, en <strong>breng een vriend aan</strong> → jullie krijgen allebei een gratis sessie.</p>${btn("/community", "Naar de community")}` },
    { delay_hours: 192, subject: "Kies wat het best bij jou past 🎟️", body_html: `<p>Betaal enkel voor je tijd, op jouw manier:</p><ul style="font-size:16px;line-height:1.6;color:#2b2550;padding-left:20px"><li><strong>Losse sessie € 15</strong> — geen verplichting</li><li><strong>10-beurtenkaart € 150</strong> — 10 + 1 gratis sessie</li><li><strong>Abonnement € 12/maand</strong> — 1 sessie inbegrepen + al je sessies aan € 12</li></ul><p>Twee sessies per maand en je abonnement verdient zichzelf al terug.</p>${btn("/lidmaatschap", "Bekijk de formules")}` },
    { delay_hours: 288, subject: "Sneller resultaat met een persoonlijke coach", body_html: `<p>Wil je gericht sterker worden, afvallen of revalideren? Onze coaches stellen een plan op maat op — training én voeding — en volgen je vooruitgang op.</p><p>Bekijk hun specialiteit en beschikbaarheid, en neem contact op voor een vrijblijvende kennismaking.</p>${btn("/coaches", "Ontmoet onze coaches")}` },
  ];
  const { data: camp, error: e } = await supabase
    .from("campaigns")
    .insert({ gym_id: profile.gym_id, kind: "drip", name: "Fittin' onboarding (kant-en-klaar)", status: "draft", trigger: "on_signup", created_by: userId })
    .select("id")
    .single();
  if (e) return { error: leesbareFout(e, "Onboarding-drip aanmaken") };
  // Zonder deze controle bleef er bij een fout een lege campagne zonder één mail achter, en ging
  // je toch door naar de pagina alsof alles klaarstond.
  const stapFout = nagekeken(await supabase.from("campaign_steps").insert(steps.map((s, i) => ({ campaign_id: camp.id, step_no: i + 1, ...s }))), "De mails van de drip bewaren");
  if (stapFout) return { error: `${stapFout.error} De campagne zelf bestaat wel — verwijder ze en probeer opnieuw.` };
  redirect(`/beheer/nieuwsbrief/${camp.id}`);
}

export async function addDripStep(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const campaignId = formData.get("campaignId");
  const { data: steps } = await supabase.from("campaign_steps").select("step_no").eq("campaign_id", campaignId);
  const next = (steps || []).reduce((m, s) => Math.max(m, s.step_no), 0) + 1;
  const fout = nagekeken(await supabase.from("campaign_steps").insert({
    campaign_id: campaignId,
    step_no: next,
    delay_hours: num(formData.get("delay_hours"), 0),
    subject: formData.get("subject") || "Nieuwe stap",
    body_html: formData.get("body") || "",
  }), "Stap toevoegen");
  if (fout) return fout;
  revalidatePath(`/beheer/nieuwsbrief/${campaignId}`);
  return { ok: true, message: `Stap ${next} toegevoegd ✓` };
}

export async function deleteDripStep(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const fout = nagekeken(await supabase.from("campaign_steps").delete({ count: "exact" }).eq("id", formData.get("id")), "Stap verwijderen");
  if (fout) return fout;
  revalidatePath(`/beheer/nieuwsbrief/${formData.get("campaignId")}`);
  return { ok: true, message: "Stap verwijderd — mails die al gepland stonden, vertrekken nog ✓" };
}

// Edit an existing drip step (subject, delay, body). Already-sent/scheduled emails are unaffected;
// the new content applies to future enrollments.
export async function updateDripStep(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const campaignId = formData.get("campaignId");
  const { error: e } = await supabase.from("campaign_steps").update({
    delay_hours: num(formData.get("delay_hours"), 0),
    subject: formData.get("subject") || "Stap",
    body_html: formData.get("body") || "",
  }).eq("id", id);
  if (e) return { error: leesbareFout(e, "Stap opslaan") };
  revalidatePath(`/beheer/nieuwsbrief/${campaignId}`);
  return { ok: true, message: "Stap opgeslagen ✓" };
}

export async function setDripStatus(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const status = formData.get("status"); // active | paused
  const fout = nagekeken(await supabase.from("campaigns").update({ status }, { count: "exact" }).eq("id", id).eq("kind", "drip"), "Drip wijzigen");
  if (fout) return fout;
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  return { ok: true, message: status === "active" ? "Drip staat aan — nieuwe inschrijvers krijgen de reeks ✓" : "Drip gepauzeerd ✓" };
}

// Enroll every current active subscriber into this drip (besides future signups).
export async function enrollAllInDrip(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const admin = createAdminClient();
  // .eq("gym_id") en .eq("kind", "drip"): deze actie gebruikt de service-role en kende dus geen
  // enkele grens — een id van een andere gym of een gerichte reeks werd gewoon aangezet.
  const fout = nagekeken(await admin.from("campaigns").update({ status: "active" }, { count: "exact" }).eq("id", id).eq("gym_id", profile.gym_id).eq("kind", "drip"), "Drip aanzetten");
  if (fout) return fout;
  const { data: subs } = await admin.from("subscribers").select("id, email, name, unsub_token").eq("gym_id", profile.gym_id).eq("status", "active");
  for (const s of subs || []) await enrollSubscriberInDrips(profile.gym_id, s);
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  const n = (subs || []).length;
  return { ok: true, enrolled: n, message: `${n} abonnee${n === 1 ? "" : "s"} ingeschreven — wie er al in zat, krijgt niets dubbel ✓` };
}

// ---------------- Subscribers ----------------
export async function addSubscriber(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Geldig e-mailadres vereist." };
  const fout = nagekeken(await supabase
    .from("subscribers")
    .upsert({ gym_id: profile.gym_id, email, name: formData.get("name") || null, source: "import", status: "active" }, { onConflict: "gym_id,email" }), "Abonnee toevoegen");
  if (fout) return fout;
  revalidatePath("/beheer/nieuwsbrief/abonnees");
  return { ok: true, message: `${email} staat op de lijst ✓` };
}

export async function setSubscriberStatus(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const status = formData.get("status");
  const fout = nagekeken(await supabase.from("subscribers").update({ status }, { count: "exact" }).eq("id", formData.get("id")), "Abonnee wijzigen");
  if (fout) return fout;
  revalidatePath("/beheer/nieuwsbrief/abonnees");
  return { ok: true, message: status === "active" ? "Abonnee krijgt weer mails ✓" : "Abonnee krijgt geen mails meer ✓" };
}
