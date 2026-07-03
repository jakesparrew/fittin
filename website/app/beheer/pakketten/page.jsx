import { getAdminContext } from "@/lib/admin";
import { upsertPackage, togglePackage } from "../actions";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";
const euro = (c) => (c / 100).toFixed(2).replace(".", ",");

export default async function Pakketten() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const { data: packages } = await supabase.from("packages").select("*").eq("gym_id", gym.id).order("sort");

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Pakketten &amp; abonnementen</h1>
      <p className="mt-1 text-sm text-brand/50">
        Beurtenkaarten en abonnementen. Bundels worden direct via Stripe verkocht; abonnementen
        gebruiken een vaste Stripe-prijs (prijs hier is informatief).
      </p>

      <div className="mt-6 space-y-4">
        {(packages || []).map((p) => (
          <ActionForm key={p.id} action={upsertPackage} success="Pakket opgeslagen ✓" className="grid items-end gap-3 rounded-2xl border border-borderc bg-white p-5 md:grid-cols-[1.3fr_.8fr_.7fr_.7fr_.6fr_.6fr_auto]">
            <input type="hidden" name="id" value={p.id} />
            <Col label="Naam"><In name="name" defaultValue={p.name} /></Col>
            <Col label="Type">
              <select name="kind" defaultValue={p.kind} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm">
                <option value="beurtenkaart">beurtenkaart</option>
                <option value="abonnement">abonnement</option>
              </select>
            </Col>
            <Col label="Prijs (€)"><In name="price_eur" defaultValue={euro(p.price_cents)} /></Col>
            <Col label="Sessies"><In name="credits" type="number" defaultValue={p.credits} /></Col>
            <Col label="Periode">
              <select name="period" defaultValue={p.period} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm">
                <option value="once">once</option>
                <option value="maand">maand</option>
              </select>
            </Col>
            <Col label="Sort"><In name="sort" type="number" defaultValue={p.sort} /></Col>
            <div className="flex gap-2">
              <button className="rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white">Opslaan</button>
            </div>
            <p className="text-xs text-brand/40 md:col-span-7">
              {p.kind === "abonnement" && (p.stripe_price_id ? `Stripe-prijs: ${p.stripe_price_id}` : "⚠ Geen Stripe-prijs gekoppeld (run stripe-setup).")}
              {" "}Status: {p.active ? "actief" : "uit"}
            </p>
          </ActionForm>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(packages || []).map((p) => (
          <form key={p.id} action={togglePackage}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={p.active ? "true" : "false"} />
            <button className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-lav">
              {p.active ? `Zet "${p.name}" uit` : `Zet "${p.name}" aan`}
            </button>
          </form>
        ))}
      </div>

      <h2 className="mt-10 font-black text-brand">Nieuw pakket</h2>
      <ActionForm action={upsertPackage} success="Pakket opgeslagen ✓" className="mt-3 grid items-end gap-3 rounded-2xl border border-dashed border-borderc bg-white p-5 md:grid-cols-[1.3fr_.8fr_.7fr_.7fr_.6fr_auto]">
        <Col label="Naam"><In name="name" /></Col>
        <Col label="Type">
          <select name="kind" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm">
            <option value="beurtenkaart">beurtenkaart</option>
            <option value="abonnement">abonnement</option>
          </select>
        </Col>
        <Col label="Prijs (€)"><In name="price_eur" defaultValue="0" /></Col>
        <Col label="Sessies"><In name="credits" type="number" defaultValue="0" /></Col>
        <Col label="Periode">
          <select name="period" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm">
            <option value="once">once</option>
            <option value="maand">maand</option>
          </select>
        </Col>
        <div><button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Toevoegen</button></div>
      </ActionForm>
    </div>
  );
}

function Col({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      {children}
    </label>
  );
}
function In({ name, type = "text", defaultValue }) {
  return <input name={name} type={type} defaultValue={defaultValue ?? ""} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none focus:border-accent" />;
}
