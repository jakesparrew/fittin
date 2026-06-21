"use client";
import { useActionState, useState } from "react";
import { updateNukiSettings, testNukiConnection, adminOpenDoor } from "@/app/beheer/actions";

// Superadmin settings for the Nuki smart lock + per-booking keypad codes.
// The API token is write-only: the field shows whether one is stored, never the value.
export default function NukiSettings({ initial, tokenSet, envToken, readOnly }) {
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const r = await updateNukiSettings(fd);
    return r?.error ? { error: r.error } : { ok: true };
  }, null);
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [doorMsg, setDoorMsg] = useState(null);

  async function runTest() {
    setTesting(true);
    setTest(null);
    try { setTest(await testNukiConnection()); } catch { setTest({ error: "Test mislukt." }); }
    setTesting(false);
  }

  async function runOpen() {
    setOpening(true);
    setDoorMsg(null);
    try { setDoorMsg(await adminOpenDoor()); } catch { setDoorMsg({ error: "Openen mislukt." }); }
    setOpening(false);
  }

  return (
    <form action={action} className="mt-8 max-w-2xl space-y-5 rounded-2xl border border-borderc bg-white p-7">
      <div>
        <h2 className="text-xl font-black text-brand">🔐 Nuki deurslot</h2>
        <p className="mt-1 text-sm text-brand/60">
          Maakt automatisch een <b>verse deurcode per boeking</b> aan, een paar minuten voor de sessie, en
          verwijdert ze weer na afloop. Het lid krijgt de code via e-mail én in de app.
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-xl bg-paper p-3 text-sm font-semibold text-brand">
        <input type="checkbox" name="nuki_enabled" defaultChecked={initial.enabled} disabled={readOnly} className="h-4 w-4 accent-[#5fda6b]" />
        Per-boeking keypad-codes inschakelen
      </label>

      <Field name="nuki_smartlock_id" label="Smartlock ID" defaultValue={initial.smartlockId} placeholder="bv. 17012345678" readOnly={readOnly} />

      <label className="block">
        <span className="mb-1 block text-sm font-bold text-brand">Nuki Web API-token</span>
        <input
          name="nuki_api_token"
          type="password"
          autoComplete="off"
          disabled={readOnly}
          placeholder={tokenSet ? "•••••••• (ingesteld — laat leeg om te behouden)" : (envToken ? "via omgevingsvariabele ingesteld — laat leeg om die te gebruiken" : "Plak je Nuki Web API-token")}
          className="w-full rounded-xl border-2 border-borderc bg-white px-4 py-2.5 text-brand outline-none transition focus:border-accent"
        />
        <span className="mt-1 block text-xs text-brand/45">Maak een token aan in Nuki Web → Account → API. Wordt versleuteld op de server bewaard, nooit getoond.</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Field name="keypad_lead_min" label="Code aanmaken (min vóór start)" type="number" defaultValue={initial.leadMin} min={0} max={60} readOnly={readOnly} />
        <Field name="keypad_grace_min" label="Code geldig (min ná einde)" type="number" defaultValue={initial.graceMin} min={0} max={180} readOnly={readOnly} />
      </div>

      <p className="rounded-2xl bg-paper p-4 text-sm text-brand/60">
        🔑 Met dit aan vervangt de per-boeking code de vaste “Toegangscode” hierboven. Lukt Nuki even niet,
        dan valt het systeem automatisch terug op die vaste code zodat niemand buitengesloten raakt.
      </p>

      {state?.error && <p className="rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-600">{state.error}</p>}
      {state?.ok && <p className="rounded-xl bg-accent/15 p-3 text-sm font-semibold text-accentdark">Opgeslagen ✓</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={readOnly || pending} className="rounded-full bg-accent px-7 py-3 font-bold text-brand transition hover:opacity-90 disabled:opacity-40">
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
        <button type="button" onClick={runTest} disabled={readOnly || testing} className="rounded-full border-2 border-borderc px-6 py-3 font-bold text-brand transition hover:border-accent disabled:opacity-40">
          {testing ? "Testen…" : "Test verbinding"}
        </button>
        <button type="button" onClick={runOpen} disabled={readOnly || opening} className="rounded-full bg-brand px-6 py-3 font-bold text-white transition hover:opacity-90 disabled:opacity-40">
          {opening ? "Openen…" : "🚪 Open de deur nu"}
        </button>
      </div>
      {doorMsg?.error && <p className="rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-600">{doorMsg.error}</p>}
      {doorMsg?.ok && <p className="rounded-xl bg-accent/15 p-3 text-sm font-semibold text-accentdark">Deur geopend ✓</p>}

      {test?.error && <p className="rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-600">{test.error}</p>}
      {test?.ok && (
        <div className="rounded-xl bg-accent/10 p-3 text-sm text-brand/80">
          <p className="font-semibold text-accentdark">Verbonden ✓ — {test.count} slot{test.count === 1 ? "" : "en"} gevonden.</p>
          {test.lockFound === false && <p className="mt-1 text-red-600">⚠️ Dit Smartlock ID staat niet in je account — controleer het.</p>}
          {test.lockFound && test.lockName && <p className="mt-1">Gekozen slot: <b>{test.lockName}</b></p>}
          {(test.locks || []).length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-brand/55">
              {test.locks.map((l) => <li key={l.id}>{l.name} — <code>{l.id}</code></li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function Field({ label, name, type = "text", defaultValue, readOnly, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-brand">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        disabled={readOnly}
        {...rest}
        className="w-full rounded-xl border-2 border-borderc bg-white px-4 py-2.5 text-brand outline-none transition focus:border-accent"
      />
    </label>
  );
}
