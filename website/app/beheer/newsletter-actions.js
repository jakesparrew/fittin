"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueNewsletter, enrollSubscriberInDrips } from "@/lib/newsletter";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";
function kickWorker() {
  const secret = process.env.CRON_SECRET;
  after(async () => {
    try { await fetch(`${SITE}/api/queue/process${secret ? `?key=${encodeURIComponent(secret)}` : ""}`, { cache: "no-store" }); } catch {}
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
  if (e) return { error: e.message };
  redirect(`/beheer/nieuwsbrief/${data.id}`);
}

export async function updateNewsletter(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  await supabase
    .from("campaigns")
    .update({
      name: formData.get("name"),
      subject: formData.get("subject"),
      preheader: formData.get("preheader"),
      body_html: formData.get("body"),
    })
    .eq("id", id)
    .eq("status", "draft");
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  return { ok: true };
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
  return { ...res, queued: res.queued };
}

export async function deleteCampaign(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("campaigns").delete().eq("id", formData.get("id"));
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
  if (e) return { error: e.message };
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
    { delay_hours: 0, subject: "Welkom bij Fittin' 👋 — zo boek je je eerste sessie", body_html: `<p>Welkom! Bij Fittin' reserveer je de privégym helemaal voor jezelf (of met vrienden) — elke dag van 6u tot 23u, € 15 voor een uur. Je eerste sessie is zelfs <strong>gratis</strong> met de code <strong>FittinWelcome</strong>.</p><p>Boeken doe je in 30 seconden: kies een moment, betaal, en de app opent de deur tijdens je sessie.</p>${btn("/boeken", "Boek je (gratis) sessie")}` },
    { delay_hours: 48, subject: "Train nooit alleen — neem een buddy mee 🤝", body_html: `<p>Samen trainen houdt je gemotiveerd. Voeg je vrienden toe als buddy en neem ze mee in dezelfde boeking — tot 4 personen in de zaal, zonder meerkost per persoon.</p><p>Je kan zelfs een seintje sturen: "ik heb geboekt, kom je mee?" en zij bevestigen met één klik.</p>${btn("/community", "Voeg je buddies toe")}` },
    { delay_hours: 120, subject: "Sneller resultaat met een personal coach", body_html: `<p>Wil je gericht sterker worden, afvallen of revalideren? Onze coaches stellen een plan op maat op — training én voeding — en volgen je vooruitgang op.</p><p>Bekijk de coaches, hun specialiteit en beschikbaarheid, en boek rechtstreeks.</p>${btn("/coaches", "Ontmoet onze coaches")}` },
    { delay_hours: 192, subject: "Bespaar met het Fittin'-abonnement", body_html: `<p>Train je meer dan 1× per maand? Met het abonnement van <strong>€ 12/maand</strong> krijg je elke maand <strong>1 sessie inbegrepen</strong> én boek je al je sessies aan <strong>€ 12</strong> in plaats van € 15. Plus member-only acties en voorrang bij events.</p><p>Twee sessies per maand en je abonnement verdient zichzelf al terug.</p>${btn("/lidmaatschap", "Word member")}` },
    { delay_hours: 288, subject: "Doe mee met events & challenges 🏆", body_html: `<p>Fittin' is meer dan een zaal. Doe mee met groepslessen en events, klim op het leaderboard en haal maandelijkse challenges voor gratis sessies.</p><p>Bekijk wat er op de planning staat.</p>${btn("/events", "Bekijk de events")}` },
  ];
  const { data: camp, error: e } = await supabase
    .from("campaigns")
    .insert({ gym_id: profile.gym_id, kind: "drip", name: "Fittin' onboarding (kant-en-klaar)", status: "draft", trigger: "on_signup", created_by: userId })
    .select("id")
    .single();
  if (e) return { error: e.message };
  await supabase.from("campaign_steps").insert(steps.map((s, i) => ({ campaign_id: camp.id, step_no: i + 1, ...s })));
  redirect(`/beheer/nieuwsbrief/${camp.id}`);
}

export async function addDripStep(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const campaignId = formData.get("campaignId");
  const { data: steps } = await supabase.from("campaign_steps").select("step_no").eq("campaign_id", campaignId);
  const next = (steps || []).reduce((m, s) => Math.max(m, s.step_no), 0) + 1;
  await supabase.from("campaign_steps").insert({
    campaign_id: campaignId,
    step_no: next,
    delay_hours: num(formData.get("delay_hours"), 0),
    subject: formData.get("subject") || "Nieuwe stap",
    body_html: formData.get("body") || "",
  });
  revalidatePath(`/beheer/nieuwsbrief/${campaignId}`);
  return { ok: true };
}

export async function deleteDripStep(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("campaign_steps").delete().eq("id", formData.get("id"));
  revalidatePath(`/beheer/nieuwsbrief/${formData.get("campaignId")}`);
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
  if (e) return { error: e.message };
  revalidatePath(`/beheer/nieuwsbrief/${campaignId}`);
  return { ok: true, message: "Stap opgeslagen ✓" };
}

export async function setDripStatus(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const status = formData.get("status"); // active | paused
  await supabase.from("campaigns").update({ status }).eq("id", id).eq("kind", "drip");
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  return { ok: true };
}

// Enroll every current active subscriber into this drip (besides future signups).
export async function enrollAllInDrip(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const admin = createAdminClient();
  await admin.from("campaigns").update({ status: "active" }).eq("id", id);
  const { data: subs } = await admin.from("subscribers").select("id, email, name, unsub_token").eq("gym_id", profile.gym_id).eq("status", "active");
  for (const s of subs || []) await enrollSubscriberInDrips(profile.gym_id, s);
  revalidatePath(`/beheer/nieuwsbrief/${id}`);
  return { ok: true, enrolled: (subs || []).length };
}

// ---------------- Subscribers ----------------
export async function addSubscriber(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Geldig e-mailadres vereist." };
  await supabase
    .from("subscribers")
    .upsert({ gym_id: profile.gym_id, email, name: formData.get("name") || null, source: "import", status: "active" }, { onConflict: "gym_id,email" });
  revalidatePath("/beheer/nieuwsbrief/abonnees");
  return { ok: true };
}

export async function setSubscriberStatus(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("subscribers").update({ status: formData.get("status") }).eq("id", formData.get("id"));
  revalidatePath("/beheer/nieuwsbrief/abonnees");
  return { ok: true };
}
