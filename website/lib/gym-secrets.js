import "server-only";

// The gym's SECRETS (IBAN, static door code) live in the service-role-only gym_integrations table
// (migration 0102), never on the world-readable gyms row. Always read/write them via the admin
// client, server-side only. Falls back to null; callers keep their own fallbacks during transition.
export async function getGymSecrets(admin, gymId) {
  if (!admin || !gymId) return { iban: null, access_code: null };
  try {
    const { data } = await admin.from("gym_integrations").select("iban, access_code").eq("gym_id", gymId).maybeSingle();
    return { iban: data?.iban || null, access_code: data?.access_code || null };
  } catch {
    return { iban: null, access_code: null };
  }
}

// Upsert one or more secret fields (admin client, beheerder-gated by the caller).
export async function setGymSecrets(admin, gymId, patch) {
  const row = { gym_id: gymId, ...patch };
  return admin.from("gym_integrations").upsert(row, { onConflict: "gym_id" });
}
