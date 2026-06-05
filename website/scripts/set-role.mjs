// Promote a user to a role (default beheerder = superadmin).
// Usage: node --env-file=.env.local scripts/set-role.mjs <email> [lid|coach|beheerder]
import { createClient } from "@supabase/supabase-js";

const [email, role = "beheerder"] = process.argv.slice(2);
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/set-role.mjs <email> [role]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: rows, error } = await sb
  .from("profiles")
  .update({ role })
  .eq("email", email)
  .select("email, role, full_name");

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}
if (!rows?.length) {
  console.error(`No account found for ${email}. Have them sign up first, then re-run.`);
  process.exit(1);
}
console.log(`✓ ${rows[0].email} is now ${rows[0].role}`);
