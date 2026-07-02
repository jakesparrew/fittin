import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateGymSettings } from "../actions";
import NukiSettings from "@/components/admin/NukiSettings";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

export default async function Instellingen() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym, profile } = ctx;
  const readOnly = profile.role !== "beheerder";

  // Nuki config lives in the service-role-only gym_integrations table; read it server-side and pass
  // only non-secret values to the client (whether a token is stored — never the token itself).
  let nukiRow = null;
  try {
    const { data } = await createAdminClient().from("gym_integrations").select("nuki_enabled, nuki_smartlock_id, keypad_lead_min, keypad_grace_min, nuki_api_token, access_code").eq("gym_id", gym.id).maybeSingle();
    nukiRow = data;
  } catch {}
  const nukiInitial = {
    enabled: !!nukiRow?.nuki_enabled,
    smartlockId: nukiRow?.nuki_smartlock_id || "",
    leadMin: nukiRow?.keypad_lead_min ?? 5,
    graceMin: nukiRow?.keypad_grace_min ?? 15,
  };
  const tokenSet = !!(nukiRow?.nuki_api_token);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Instellingen</h1>
      <p className="mt-1 text-sm text-brand/50">Algemene gegevens van de gym.</p>

      {readOnly && (
        <p className="mt-4 rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accentdark">
          Alleen een beheerder kan deze instellingen wijzigen.
        </p>
      )}

      <ActionForm action={updateGymSettings} success="Instellingen opgeslagen ✓" className="mt-6 max-w-2xl space-y-5 rounded-2xl border border-borderc bg-white p-7">
        <Field name="name" label="Naam" defaultValue={gym.name} />
        <Field name="address" label="Adres" defaultValue={gym.address} />
        <Field name="slot_minutes" label="Duur van een sessie (min)" type="number" defaultValue={gym.slot_minutes} min={15} max={240} />
        <Field name="access_code" label="Toegangscode (in de toegangsmail, ± 5 min voor de sessie)" defaultValue={nukiRow?.access_code || ""} />
        <Field name="access_info" label="Extra toegangsinstructie (optioneel)" defaultValue={gym.access_info} />

        <div className="grid grid-cols-2 gap-4">
          <Field name="open_hour" label="Eerste boekbaar uur" type="number" defaultValue={gym.open_hour ?? 6} min={0} max={23} />
          <Field name="close_hour" label="Sluitingsuur (laatste start = sluiting − 1)" type="number" defaultValue={gym.close_hour ?? 23} min={1} max={24} />
        </div>
        <p className="rounded-2xl bg-paper p-4 text-sm text-brand/60">
          🕑 Leden kunnen boeken van <b>{gym.open_hour ?? 6}u</b> tot <b>{gym.close_hour ?? 23}u</b> — de laatste sessie start om {(gym.close_hour ?? 23) - 1}u. (Prijzen per sessie beheer je bij <b>Diensten &amp; prijzen</b>.)
        </p>
        <p className="rounded-2xl bg-paper p-4 text-sm text-brand/60">
          🔑 De <b>toegangscode</b> hierboven wordt automatisch ± 5 minuten voor elke sessie naar het lid gemaild (met adres + navigatieknop). Leden kunnen hun sessie tot <b>6u</b> vooraf verplaatsen; annuleren kan niet meer.
        </p>

        <button
          disabled={readOnly}
          className="rounded-full bg-accent px-7 py-3 font-bold text-brand transition hover:opacity-90 disabled:opacity-40"
        >
          Opslaan
        </button>
      </ActionForm>

      <NukiSettings initial={nukiInitial} tokenSet={tokenSet} envToken={false} readOnly={readOnly} />
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
