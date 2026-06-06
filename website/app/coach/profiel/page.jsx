import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { saveCoachProfile, uploadCoachPhoto } from "../actions";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

export default async function CoachProfiel() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, coach_bio, coach_specialty, coach_photo_url, coach_pricelist, coach_public")
    .eq("id", userId)
    .single();

  return (
    <div className="px-8 py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-brand">Mijn profiel</h1>
        {me?.coach_public && <Link href="/coaches" className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">Bekijk op de site →</Link>}
      </div>
      <p className="mt-1 text-sm text-brand/50">Dit is wat (toekomstige) leden zien op de Fittin&rsquo;-site. Zet het zichtbaar als je klaar bent.</p>

      {/* Photo upload */}
      <ActionForm action={uploadCoachPhoto} success="Foto geüpload ✓" className="mt-6 flex max-w-2xl flex-wrap items-center gap-4 rounded-3xl border border-borderc bg-white p-6">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-paper">
          {me?.coach_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.coach_photo_url} alt="Profielfoto" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-black text-brand/20">{(me?.full_name || "C").slice(0, 1)}</div>
          )}
        </div>
        <div className="flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-lav">Profielfoto uploaden</span>
          <input type="file" name="photo" accept="image/*" required className="mt-2 block w-full text-sm text-brand file:mr-3 file:rounded-full file:border-0 file:bg-paper file:px-4 file:py-2 file:text-sm file:font-bold file:text-brand" />
          <p className="mt-1 text-xs text-brand/40">JPG/PNG, max 4 MB.</p>
        </div>
        <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Uploaden</button>
      </ActionForm>

      <ActionForm action={saveCoachProfile} success="Profiel opgeslagen ✓" className="mt-4 max-w-2xl space-y-4 rounded-3xl border border-borderc bg-white p-6">
        <label className="flex items-center gap-2 rounded-xl bg-paper p-3 text-sm font-bold text-brand">
          <input type="checkbox" name="public" defaultChecked={me?.coach_public} className="h-4 w-4 accent-[#5fda6b]" />
          Toon mijn profiel publiek op fittin.be/coaches
        </label>
        <Field name="specialty" label="Specialiteit" defaultValue={me?.coach_specialty} placeholder="bv. Krachttraining · afvallen · revalidatie" />
        <Field name="photo_url" label="Foto-URL" defaultValue={me?.coach_photo_url} placeholder="https://… (link naar je foto)" />
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Over mij</span>
          <textarea name="bio" rows={5} defaultValue={me?.coach_bio || ""} placeholder="Vertel iets over jezelf, je aanpak en ervaring…" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Prijslijst</span>
          <textarea name="pricelist" rows={3} defaultValue={me?.coach_pricelist || ""} placeholder="bv. 1 sessie € 40 · 10-beurtenkaart € 350" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <button className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand">Opslaan</button>
      </ActionForm>
    </div>
  );
}

function Field({ name, label, defaultValue, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} defaultValue={defaultValue || ""} placeholder={placeholder} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}
