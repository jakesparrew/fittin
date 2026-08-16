import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Persoonlijke context voor één oefeningpagina: ben ik ingelogd, staat deze oefening bij mijn
// favorieten, en welke schema-dagen heb ik om hem aan toe te voegen?
//
// Waarom een aparte route en niet gewoon in de pagina: /oefeningen/[slug] is bewust statisch
// gecachet (revalidate = 300) voor SEO. Persoonlijke data daarin ophalen zou die cache per
// bezoeker breken — en erger, hij zou het antwoord van de éne bezoeker aan de volgende kunnen
// tonen. Dus: pagina blijft publiek en identiek voor iedereen, dit stukje komt er los bij.
export async function GET(req) {
  const exerciseId = req.nextUrl.searchParams.get("exerciseId");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ingelogd: false }, { headers: { "Cache-Control": "no-store" } });

  const [{ data: fav }, { data: plannen }] = await Promise.all([
    exerciseId
      ? supabase.from("exercise_favorites").select("exercise_id").eq("user_id", user.id).eq("exercise_id", exerciseId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("programs").select("id, name, is_active").eq("member_id", user.id).order("is_active", { ascending: false }).order("created_at", { ascending: false }).limit(6),
  ]);

  // "Losse oefeningen" is het verborgen schema waar losse logs in landen — dat is geen plek waar
  // je bewust een oefening naartoe sleept, dus houden we het uit de kiezer.
  const echt = (plannen || []).filter((p) => p.name !== "Losse oefeningen");
  let dagen = [];
  if (echt.length) {
    const { data: d } = await supabase
      .from("program_days").select("id, name, day_no, program_id")
      .in("program_id", echt.map((p) => p.id)).order("day_no");
    const naamVan = new Map(echt.map((p) => [p.id, p.name]));
    dagen = (d || []).slice(0, 12).map((x) => ({
      id: x.id,
      naam: x.name || `Dag ${x.day_no}`,
      planNaam: naamVan.get(x.program_id) || "Schema",
    }));
  }

  return NextResponse.json(
    { ingelogd: true, favoriet: !!fav, dagen },
    { headers: { "Cache-Control": "no-store" } }
  );
}
