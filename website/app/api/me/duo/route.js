import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { duoVoortgang } from "@/lib/workout-share";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Wie van mijn buddies is hier nu ook mee bezig?" — het samen-trainen-gevoel zonder gedeelde
// sessie: ieder logt op zijn eigen telefoon, precies zoals nu, en ziet elkaars voortgang.
//
// Bewust polling en geen websockets: een workout duurt een uur en een verversing per 30 seconden
// is ruim genoeg. Websockets zouden hier infrastructuur toevoegen voor een gevoel, niet voor een
// functie.
export async function GET(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ buddies: [] }, { headers: { "Cache-Control": "no-store" } });

  const peIds = (req.nextUrl.searchParams.get("pe") || "").split(",").filter(Boolean).slice(0, 60);
  const admin = createAdminClient();

  // Geaccepteerde buddies, in beide richtingen (verzoeker én ontvanger).
  const { data: bud } = await admin
    .from("buddies").select("requester_id, addressee_id")
    .eq("status", "accepted").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  const buddyIds = (bud || []).map((b) => (b.requester_id === user.id ? b.addressee_id : b.requester_id));
  if (!buddyIds.length) return NextResponse.json({ buddies: [] }, { headers: { "Cache-Control": "no-store" } });

  // Alleen wie zichtbaarheid AAN zette telt mee. Dat iemand traint is persoonlijke data; het
  // duo-zicht mag nooit een verrassing zijn voor degene die getoond wordt.
  const { data: profs } = await admin
    .from("profiles").select("id, full_name, training_visible_to_buddies").in("id", buddyIds);
  const zichtbaar = (profs || []).filter((p) => p.training_visible_to_buddies).map((p) => p.id);
  if (!zichtbaar.length) return NextResponse.json({ buddies: [] }, { headers: { "Cache-Control": "no-store" } });

  const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  let q = admin.from("workout_logs").select("user_id, program_exercise_id, sets_json, logged_on")
    .in("user_id", zichtbaar).eq("logged_on", vandaag);
  if (peIds.length) q = q.in("program_exercise_id", peIds);
  const { data: logs } = await q;

  const naam = new Map((profs || []).map((p) => [p.id, (p.full_name || "Buddy").split(" ")[0]]));
  const rijen = duoVoortgang({ logs: logs || [], buddyIds, zichtbaar, vandaag, peIds })
    .map((r) => ({ naam: naam.get(r.userId) || "Buddy", oefeningen: r.oefeningen, sets: r.sets }));

  return NextResponse.json({ buddies: rijen }, { headers: { "Cache-Control": "no-store" } });
}
