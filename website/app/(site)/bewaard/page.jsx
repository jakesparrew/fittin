import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { verrijkClip } from "@/lib/clips";
import ClipBibliotheek from "@/components/clips/ClipBibliotheek";
import { coachClipNaarOefening } from "@/app/coach/coaching-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn video's | Fittin'", robots: { index: false } };

export default async function Bewaard() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/bewaard");

  const supabase = await createClient();
  const [{ data: folders }, { data: clips }] = await Promise.all([
    supabase.from("clip_folders").select("id, name").eq("user_id", user.id).order("name"),
    supabase.from("clips").select("id, folder_id, url, provider, ref, title, note, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
  ]);

  const isStaf = ["coach", "beheerder"].includes(profile?.role);

  return (
    <main className="min-h-screen bg-paper">
      {/* Bewust korter dan de andere koppen: op een telefoon at de intro anders het halve scherm op
          en begon de plank pas onder de vouw. Wie hier komt, komt voor zijn video's. */}
      <div className="mx-auto max-w-5xl px-5 py-8 md:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Bewaard</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Mijn video&rsquo;s</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-brand/60">
          Een oefening gezien op Instagram, YouTube of TikTok? Bewaar de link onder je eigen mappen.
          {isStaf ? " Met één tik wordt er een oefening van voor je programma's." : ""}
        </p>

        <div className="mt-6">
          {/* De coach-actie geven we alleen door aan wie ze mag gebruiken. De actie zelf controleert
              dat nog eens op de server — dit is enkel om de knop niet te tonen aan een lid. */}
          <ClipBibliotheek
            clips={(clips || []).map(verrijkClip)}
            folders={folders || []}
            onNaarOefening={isStaf ? coachClipNaarOefening : null}
          />
        </div>

        <p className="mt-10 border-t border-borderc pt-5 text-xs leading-relaxed text-ink-soft">
          We bewaren enkel de link en de naam die je zelf geeft — nooit de video zelf. Afspelen
          gebeurt in het kader van de bron. Verdwijnt een post daar, dan verdwijnt hij ook hier.
          Op zoek naar de uitgewerkte oefeningen met uitleg?{" "}
          <Link href="/oefeningen" className="font-semibold text-accentdark hover:underline">Bekijk de bibliotheek</Link>.
        </p>
      </div>
    </main>
  );
}
