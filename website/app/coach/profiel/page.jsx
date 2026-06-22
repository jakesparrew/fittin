import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { saveCoachProfile } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import PhotoUpload from "@/components/coach/PhotoUpload";

export const dynamic = "force-dynamic";
const eur = (c) => (c != null ? (c / 100).toFixed(2).replace(".", ",") : "");

export default async function CoachProfiel() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, coach_bio, coach_specialty, coach_photo_url, coach_pricelist, coach_pt_price_cents, coach_pt2_price_cents, coach_pt3_price_cents, coach_public, bill_company, bill_vat, bill_address")
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

      {/* Photo upload — compressed in the browser before upload */}
      <div className="mt-6 max-w-2xl">
        <PhotoUpload currentUrl={me?.coach_photo_url} name={me?.full_name} />
      </div>

      <ActionForm action={saveCoachProfile} success="Profiel opgeslagen ✓" className="mt-4 max-w-2xl space-y-4 rounded-3xl border border-borderc bg-white p-6">
        <label className="flex items-center gap-2 rounded-xl bg-paper p-3 text-sm font-bold text-brand">
          <input type="checkbox" name="public" defaultChecked={me?.coach_public} className="h-4 w-4 accent-[#5fda6b]" />
          Toon mijn profiel publiek op fittin.be/coaches
        </label>
        <Field name="full_name" label="Naam" defaultValue={me?.full_name} placeholder="Voornaam Naam" />
        <Field name="specialty" label="Specialiteit" defaultValue={me?.coach_specialty} placeholder="bv. Krachttraining · afvallen · revalidatie" />
        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Personal-training tarieven</span>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field name="pt1_eur" label="1-op-1 (€ / sessie)" defaultValue={eur(me?.coach_pt_price_cents)} placeholder="bv. 60" />
            <Field name="pt2_eur" label="1-op-2 (€ pp)" defaultValue={eur(me?.coach_pt2_price_cents)} placeholder="bv. 40" />
            <Field name="pt3_eur" label="1-op-3 (€ pp)" defaultValue={eur(me?.coach_pt3_price_cents)} placeholder="bv. 30" />
          </div>
          <p className="mt-1 text-xs text-brand/40">Leeg = niet aangeboden. Deze tarieven verschijnen op je profiel én in de boeking (1-op-2/1-op-3 zijn prijs per persoon).</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Over mij</span>
          <textarea name="bio" rows={5} defaultValue={me?.coach_bio || ""} placeholder="Vertel iets over jezelf, je aanpak en ervaring…" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Extra prijsinfo / notities (optioneel)</span>
          <textarea name="pricelist" rows={3} defaultValue={me?.coach_pricelist || ""} placeholder="bv. 1 sessie € 40 · 10-beurtenkaart € 350" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <div className="rounded-xl border border-borderc bg-paper/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-lav">Facturatiegegevens (voor je facturen)</p>
          <p className="mt-1 text-xs text-brand/50">Nodig voor de factuur van je sessietegoed-aankopen (B2B). Vul je bedrijfsnaam, btw-nummer en adres in zodat je factuur correct is volgens de Belgische regels.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field name="bill_company" label="Bedrijfsnaam" defaultValue={me?.bill_company} placeholder="bv. Coaching Jan BV" />
            <Field name="bill_vat" label="Btw-nummer" defaultValue={me?.bill_vat} placeholder="BE 0123.456.789" />
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Facturatieadres</span>
            <textarea name="bill_address" rows={2} defaultValue={me?.bill_address || ""} placeholder="Straat 1, 9000 Gent" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
          </label>
        </div>
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
