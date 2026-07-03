import { getAdminContext } from "@/lib/admin";
import { upsertService, toggleService } from "../actions";
import { createDiscount, toggleDiscount, deleteDiscount } from "../promotions-actions";
import QuickStart from "@/components/admin/QuickStart";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

const euro = (c) => (c / 100).toFixed(2).replace(".", ",");
const fmtDay = (d) => (d ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : null);

export default async function Diensten() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const [{ data: services }, { data: codes }] = await Promise.all([
    supabase.from("services").select("*").eq("gym_id", gym.id).order("price_cents"),
    supabase.from("discount_codes").select("*").eq("gym_id", gym.id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Diensten &amp; prijzen</h1>
      <p className="mt-1 text-sm text-brand/50">Pas prijzen, duur en capaciteit aan. Prijzen in euro.</p>

      <div className="mt-6 space-y-4">
        {(services || []).map((s) => (
          <form
            key={s.id}
            action={upsertService}
            className="grid items-end gap-3 rounded-2xl border border-borderc bg-white p-5 md:grid-cols-[1.4fr_1fr_.7fr_.7fr_.7fr_auto]"
          >
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="type" value={s.type} />
            <input type="hidden" name="key" value={s.key} />
            <input type="hidden" name="active" value={s.active ? "true" : "false"} />
            <Col label="Naam"><In name="name" defaultValue={s.name} /></Col>
            <Col label="Prijs (€)"><In name="price_eur" defaultValue={euro(s.price_cents)} /></Col>
            <Col label="Duur (min)"><In name="duration_min" type="number" defaultValue={s.duration_min} /></Col>
            <Col label="Max pers."><In name="capacity" type="number" defaultValue={s.capacity} /></Col>
            <Col label="Status">
              <span className={"inline-block rounded-full px-3 py-1 text-xs font-bold " + (s.active ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/40")}>
                {s.active ? "Actief" : "Uit"}
              </span>
            </Col>
            <div className="flex gap-2">
              <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Opslaan</button>
            </div>
          </form>
        ))}
      </div>

      {/* Toggle active is a separate action per row */}
      <div className="mt-6 space-y-2">
        {(services || []).map((s) => (
          <form key={s.id} action={toggleService} className="inline-block">
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="active" value={s.active ? "true" : "false"} />
            <button className="mr-2 rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-lav">
              {s.active ? `Zet "${s.name}" uit` : `Zet "${s.name}" aan`}
            </button>
          </form>
        ))}
      </div>

      {/* ---------- Kortingscodes & acties ---------- */}
      <h2 className="mt-12 text-2xl font-black text-brand">Kortingscodes &amp; acties</h2>
      <p className="mt-1 text-sm text-brand/50">Maak promoties om je gym beter te vullen — leden gebruiken de code bij het afrekenen.</p>
      <QuickStart title="Een actie maken" steps={[
        { title: "Kies een pakkende code", body: "bv. ZOMER20, TERUG50 of BRINGAFRIEND." },
        { title: "Zet het kortingspercentage", body: "1–100% op de sessieprijs." },
        { title: "Beperk indien gewenst", body: "max. aantal keer te gebruiken + 1× per lid, of een vervaldatum." },
        { title: "Deel de code", body: "via je nieuwsbrief, social of aan de balie — leden vullen ze in bij het boeken." },
      ]} />

      <ActionForm action={createDiscount} success="Kortingscode aangemaakt ✓" className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <Col label="Code"><In name="code" defaultValue="" /></Col>
        <Col label="Korting (%)"><In name="percent" type="number" defaultValue="20" /></Col>
        <Col label="of vast bedrag (€)"><In name="amount_eur" type="number" defaultValue="" /></Col>
        <Col label="Max. keer (leeg = ∞)"><In name="max_uses" type="number" defaultValue="" /></Col>
        <Col label="Vervalt op"><In name="expires_at" type="date" defaultValue="" /></Col>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-bold text-brand/70">
          <input type="checkbox" name="per_user_once" defaultChecked className="h-4 w-4 accent-[#5fda6b]" /> 1× per lid
        </label>
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Code aanmaken</button>
      </ActionForm>

      <div className="mt-4 space-y-2">
        {(codes || []).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-4">
            <div>
              <p className="font-black text-brand">{c.code} <span className="ml-1 text-accentdark">{c.amount_cents != null ? `−€ ${(c.amount_cents / 100).toFixed(2).replace(".", ",")}` : `−${c.percent}%`}</span></p>
              <p className="text-xs text-brand/50">
                {c.used_count}{c.max_uses ? `/${c.max_uses}` : ""} gebruikt
                {c.per_user_once ? " · 1× per lid" : ""}
                {c.expires_at ? ` · vervalt ${fmtDay(c.expires_at)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={"rounded-full px-3 py-1 text-xs font-bold " + (c.active ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/40")}>{c.active ? "Actief" : "Uit"}</span>
              <ActionForm action={toggleDiscount} success="Bijgewerkt ✓"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? "true" : "false"} /><button className="rounded-full border-2 border-borderc px-3 py-1 text-xs font-bold text-brand">{c.active ? "Zet uit" : "Zet aan"}</button></ActionForm>
              <ActionForm action={deleteDiscount} success="Kortingscode verwijderd ✓"><input type="hidden" name="id" value={c.id} /><button className="text-xs font-bold text-red-500 hover:underline">×</button></ActionForm>
            </div>
          </div>
        ))}
        {(!codes || codes.length === 0) && <p className="text-sm text-brand/50">Nog geen kortingscodes.</p>}
      </div>
    </div>
  );
}

function Col({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">{label}</span>
      {children}
    </label>
  );
}
function In({ name, type = "text", defaultValue }) {
  return (
    <input
      name={name}
      type={type}
      defaultValue={defaultValue ?? ""}
      className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent"
    />
  );
}
