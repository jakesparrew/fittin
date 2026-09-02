import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { vindLink } from "@/lib/clips";
import BewaarSheet from "@/components/clips/BewaarSheet";

// Het landingsscherm van de Android-deelknop (zie het share_target in app/manifest.js) én de
// gewone "bewaar een video"-pagina.
//
// Instagram deelt zelden netjes: soms komt de link in `url`, soms in `text` samen met de caption,
// soms staat alleen `title` ingevuld. Daarom kijken we in alle drie en vissen we de eerste link
// eruit, in plaats van één veld te vertrouwen en bij de rest een leeg scherm te tonen.

export const dynamic = "force-dynamic";
export const metadata = { title: "Video bewaren | Fittin'", robots: { index: false } };

export default async function Bewaren({ searchParams }) {
  if (!isSupabaseConfigured) redirect("/");
  const sp = (await searchParams) || {};
  const uit = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const gedeeld = [uit(sp.url), uit(sp.text), uit(sp.title)].filter(Boolean).join(" ").slice(0, 4000);
  const link = vindLink(gedeeld) || uit(sp.url);

  const { user } = await getSessionProfile();
  // Na het inloggen belandt iemand terug op dit scherm mét zijn gedeelde link: anders is de deelknop
  // een val — je deelt iets, je moet inloggen, en je link is weg.
  if (!user) {
    const terug = `/bewaren${link ? `?url=${encodeURIComponent(link)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(terug)}`);
  }

  const supabase = await createClient();
  const { data: folders } = await supabase
    .from("clip_folders").select("id, name").eq("user_id", user.id).order("name");

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-lg px-5 py-12">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Bewaren</p>
        <h1 className="mt-2 text-3xl font-black text-brand">Video bewaren</h1>
        <p className="mt-2 leading-relaxed text-brand/60">
          Plak een link van Instagram, YouTube of TikTok en geef hem een plek in je bibliotheek.
        </p>
        <div className="mt-8 rounded-3xl border border-borderc bg-white p-6">
          <BewaarSheet folders={folders || []} initieelRuw={link} ingebed />
        </div>
      </div>
    </main>
  );
}
