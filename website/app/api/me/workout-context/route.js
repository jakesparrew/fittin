import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Persoonlijke context voor één publieke workout: ben ik ingelogd, wat logde ik de vorige keer per
// oefening, en welke oefeningen heb ik vandaag al afgevinkt?
//
// Waarom een aparte route en niet gewoon in de pagina: /workouts/[slug] stond op force-dynamic
// enkel en alleen om deze twee dingen te kunnen ophalen. Daardoor werd élke bezoeker — ook de
// uitgelogde die via Google binnenkomt — server-side gerenderd met een auth-rondrit erbij. De
// pagina is voor iedereen identiek en kan dus statisch; dit stukje komt er los bij, net zoals
// bij /oefeningen/[slug].
export async function GET(req) {
  const ids = String(req.nextUrl.searchParams.get("pe") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60); // een workout heeft er hooguit een handvol; de grens houdt de URL en query klein

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ids.length) {
    return NextResponse.json({ ingelogd: !!user, lastByPe: {}, doneToday: {} }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: logs } = await supabase
    .from("workout_logs")
    .select("program_exercise_id, sets_json, logged_on")
    .eq("user_id", user.id)
    .in("program_exercise_id", ids)
    .order("logged_on", { ascending: false });

  const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const lastByPe = {};
  const doneToday = {};
  const gezien = new Set();
  for (const l of logs || []) {
    const arr = Array.isArray(l.sets_json) ? l.sets_json : null;
    if (l.logged_on === vandaag && (arr || l.sets_json?.done)) doneToday[l.program_exercise_id] = true;
    // Aflopend op datum ⇒ de eerste rij per oefening is de meest recente set-tabel.
    if (arr && !gezien.has(l.program_exercise_id)) {
      gezien.add(l.program_exercise_id);
      lastByPe[l.program_exercise_id] = arr;
    }
  }

  return NextResponse.json({ ingelogd: true, lastByPe, doneToday }, { headers: { "Cache-Control": "no-store" } });
}
