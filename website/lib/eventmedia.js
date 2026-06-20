import { createAdminClient } from "@/lib/supabase/admin";

// Upload an event cover image (≤5MB) to the public event-images bucket; returns the public URL or null.
export async function uploadEventImage(file, gymId) {
  if (!file || typeof file === "string" || !file.size) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("Afbeelding mag max. 5 MB zijn.");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error("Enkel JPG, PNG, WebP of GIF (geen SVG).");
  const admin = createAdminClient();
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${gymId}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("event-images").upload(path, buf, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return admin.storage.from("event-images").getPublicUrl(path).data.publicUrl;
}

// Build a [{q,a}] FAQ array from faq_q1/faq_a1 … faq_q5/faq_a5 form fields.
export function parseFaq(formData) {
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const q = String(formData.get(`faq_q${i}`) || "").trim();
    const a = String(formData.get(`faq_a${i}`) || "").trim();
    if (q && a) out.push({ q, a });
  }
  return out;
}
