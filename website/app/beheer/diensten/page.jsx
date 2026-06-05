import { getAdminContext } from "@/lib/admin";
import { upsertService, toggleService } from "../actions";

export const dynamic = "force-dynamic";

const euro = (c) => (c / 100).toFixed(2).replace(".", ",");

export default async function Diensten() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("gym_id", gym.id)
    .order("price_cents");

  return (
    <div className="px-8 py-8">
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
