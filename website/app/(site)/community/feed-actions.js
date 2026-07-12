"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, full_name, role").eq("id", user.id).single();
  return { supabase, user, profile };
}

async function uploadFeedImage(file, gymId) {
  if (!file || typeof file === "string" || !file.size) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("Afbeelding mag max. 5 MB zijn.");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error("Enkel JPG, PNG, WebP of GIF (geen SVG).");
  const admin = createAdminClient();
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${gymId}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("feed-images").upload(path, buf, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return admin.storage.from("feed-images").getPublicUrl(path).data.publicUrl;
}

// Create a manual post (member) or a coach tip (coach/beheerder). Optional photo.
export async function createPost(formData) {
  const { supabase, user, profile, error } = await me();
  if (error) return { error };
  const body = String(formData.get("body") || "").trim();
  let image_url = null;
  try { image_url = await uploadFeedImage(formData.get("image"), profile.gym_id); } catch (e) { return { error: e.message }; }
  if (!body && !image_url) return { error: "Schrijf iets of voeg een foto toe." };
  const wantsTip = formData.get("kind") === "coach_tip";
  const kind = wantsTip && (profile.role === "coach" || profile.role === "beheerder") ? "coach_tip" : "post";
  const { error: e } = await supabase.from("posts").insert({
    gym_id: profile.gym_id, author_id: user.id, kind, body: body || null, image_url, audience: "gym",
  });
  if (e) return { error: e.message };
  revalidatePath("/community");
  revalidatePath("/coach");
  return { ok: true, message: kind === "coach_tip" ? "Tip geplaatst ✓" : "Geplaatst ✓" };
}

// W6 — share a completed workout to the feed (closes the log → celebrate → community loop).
export async function shareWorkoutDone(formData) {
  const { supabase, user, profile, error } = await me();
  if (error) return { error };
  const name = String(formData.get("name") || "workout").trim().slice(0, 80);
  const count = parseInt(formData.get("count"), 10) || 0;
  const body = `Rondde “${name}” af 💪${count ? ` — ${count} oefeningen` : ""}`;
  const { error: e } = await supabase.from("posts").insert({
    gym_id: profile.gym_id, author_id: user.id, kind: "achievement", body, audience: "gym", meta: { workout: name, count },
  });
  if (e) return { error: e.message };
  revalidatePath("/community");
  return { ok: true, message: "Gedeeld in de community 🎉" };
}

export async function deletePost(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  await supabase.from("posts").delete().eq("id", formData.get("id"));
  revalidatePath("/community");
  return { ok: true };
}

// Like / unlike a post (toggle).
export async function toggleKudos(formData) {
  const { supabase, user, profile, error } = await me();
  if (error) return { error };
  const postId = formData.get("postId");
  const { data: existing } = await supabase.from("post_kudos").select("post_id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
  if (existing) {
    await supabase.from("post_kudos").delete().eq("post_id", postId).eq("user_id", user.id);
  } else {
    await supabase.from("post_kudos").insert({ post_id: postId, user_id: user.id });
    // Notify the post author someone gave kudos (not for your own post).
    try {
      const admin = createAdminClient();
      const { data: post } = await admin.from("posts").select("author_id, gym_id").eq("id", postId).single();
      if (post && post.author_id !== user.id) {
        await admin.from("notifications").insert({ gym_id: post.gym_id, user_id: post.author_id, actor_id: user.id, type: "kudos", title: `${profile.full_name || "Iemand"} gaf je een kudos 👏`, body: null, link: "/community" });
      }
    } catch {}
  }
  revalidatePath("/community");
  return { ok: true };
}

export async function addComment(formData) {
  const { supabase, user, profile, error } = await me();
  if (error) return { error };
  const postId = formData.get("postId");
  const body = String(formData.get("body") || "").trim();
  if (!body) return { error: "Lege reactie." };
  const { error: e } = await supabase.from("post_comments").insert({ post_id: postId, user_id: user.id, body });
  if (e) return { error: e.message };
  try {
    const admin = createAdminClient();
    const { data: post } = await admin.from("posts").select("author_id, gym_id").eq("id", postId).single();
    if (post && post.author_id !== user.id) {
      await admin.from("notifications").insert({ gym_id: post.gym_id, user_id: post.author_id, actor_id: user.id, type: "comment", title: `${profile.full_name || "Iemand"} reageerde op je post`, body: body.slice(0, 80), link: "/community" });
    }
  } catch {}
  revalidatePath("/community");
  return { ok: true };
}
