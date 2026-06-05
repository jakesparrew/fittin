import { getAdminContext } from "@/lib/admin";
import { updateGymSettings } from "../actions";

export const dynamic = "force-dynamic";

export default async function Instellingen() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym, profile } = ctx;
  const readOnly = profile.role !== "beheerder";

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Instellingen</h1>
      <p className="mt-1 text-sm text-brand/50">Algemene gegevens van de gym.</p>

      {readOnly && (
        <p className="mt-4 rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accentdark">
          Alleen een beheerder kan deze instellingen wijzigen.
        </p>
      )}

      <form action={updateGymSettings} className="mt-6 max-w-2xl space-y-5 rounded-2xl border border-borderc bg-white p-7">
        <Field name="name" label="Naam" defaultValue={gym.name} />
        <Field name="address" label="Adres" defaultValue={gym.address} />
        <Field name="slot_minutes" label="Duur van een sessie (min)" type="number" defaultValue={gym.slot_minutes} min={15} max={240} />
        <Field name="cancel_hours" label="Annuleren tot (uren voor de sessie)" type="number" defaultValue={gym.cancel_hours ?? 1} min={0} max={72} />

        <div className="rounded-2xl bg-paper p-4 text-sm text-brand/60">
          <p className="font-bold text-brand">🕑 24/7 open</p>
          <p className="mt-1">
            De gym is dag en nacht beschikbaar — leden kunnen elk uur boeken. Openingsuren en
            dalurentarieven staan uit. (Prijzen per sessie beheer je bij <b>Diensten &amp; prijzen</b>.)
          </p>
        </div>

        <button
          disabled={readOnly}
          className="rounded-full bg-accent px-7 py-3 font-bold text-brand transition hover:opacity-90 disabled:opacity-40"
        >
          Opslaan
        </button>
      </form>
    </div>
  );
}

function Field({ label, name, type = "text", defaultValue, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-brand">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        {...rest}
        className="w-full rounded-xl border-2 border-borderc bg-white px-4 py-2.5 text-brand outline-none transition focus:border-accent"
      />
    </label>
  );
}
