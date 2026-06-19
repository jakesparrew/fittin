import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import GenerateForm from "./GenerateForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Genereer een schema | Fittin'" };

export default async function GenereerPage() {
  if (!isSupabaseConfigured) redirect("/");
  const { user } = await getSessionProfile();
  if (!user) redirect("/login?next=/plannen/genereer");
  const aiConfigured = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-xl px-5 py-14">
        <Link href="/plannen" className="text-sm font-bold text-brand/60 hover:text-brand">← Mijn plannen</Link>
        <h1 className="mt-4 text-3xl font-black md:text-4xl">Genereer een schema</h1>
        <p className="mt-2 text-brand/60">Vertel ons je doel en niveau — de AI stelt een schema op uit onze oefeningenbibliotheek dat je daarna vrij kan aanpassen of activeren.</p>

        {aiConfigured ? (
          <GenerateForm />
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-borderc bg-white p-8 text-center">
            <p className="font-semibold text-brand/70">AI-generatie is nog niet geconfigureerd.</p>
            <p className="mt-1 text-sm text-brand/50">De beheerder moet een <code>ANTHROPIC_API_KEY</code> instellen. Bouw intussen zelf een plan of kies een sjabloon.</p>
            <Link href="/plannen" className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-black text-brand transition hover:opacity-90">Naar mijn plannen</Link>
          </div>
        )}
      </div>
    </main>
  );
}
