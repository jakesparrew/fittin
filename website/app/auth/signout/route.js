import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUSH_COOKIE } from "@/lib/push";

export async function POST(request) {
  const supabase = await createClient();
  // Uitloggen in de app = geen pushes meer naar DIT toestel voor dit account. De token staat in
  // een httpOnly-cookie (gezet bij het registreren, /api/me/push), zodat elk bestaand
  // uitlogformulier dit vanzelf doet zonder extra JavaScript.
  const token = request.cookies.get(PUSH_COOKIE)?.value;
  if (token) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await createAdminClient().from("push_tokens").update({ active: false }).eq("user_id", user.id).eq("token", token).then(() => {}, () => {});
    }
  }
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  if (token) res.cookies.delete(PUSH_COOKIE);
  return res;
}
