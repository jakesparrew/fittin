import { createAdminClient } from "@/lib/supabase/admin";

// Create an in-app notification (the 'bell'). Service-role so it works from any action.
// Fails silently — a missing notification must never break the underlying action.
export async function notify({ gymId, userId, actorId = null, type, title, body = null, link = null }) {
  if (!gymId || !userId || !type || !title) return;
  try {
    await createAdminClient().from("notifications").insert({ gym_id: gymId, user_id: userId, actor_id: actorId, type, title, body, link });
  } catch {}
}

// Notify every beheerder of a gym (actionable admin alerts: coach proposals, requests, …).
export async function notifyAdmins({ gymId, type, title, body = null, link = null, actorId = null }) {
  if (!gymId || !type || !title) return;
  try {
    const admin = createAdminClient();
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", gymId).eq("role", "beheerder");
    if (!admins?.length) return;
    await admin.from("notifications").insert(admins.map((a) => ({ gym_id: gymId, user_id: a.id, actor_id: actorId, type, title, body, link })));
  } catch {}
}

// Notify many recipients at once.
export async function notifyMany(userIds, base) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    await createAdminClient().from("notifications").insert(
      ids.map((uid) => ({ gym_id: base.gymId, user_id: uid, actor_id: base.actorId || null, type: base.type, title: base.title, body: base.body || null, link: base.link || null }))
    );
  } catch {}
}
