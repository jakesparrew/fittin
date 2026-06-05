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
