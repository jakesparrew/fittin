export const metadata = { title: "Offline | Fittin'" };

// Shown by the service worker when a navigation fails and nothing is cached. Fully static so it
// works with zero network. Keeps the door-access fallback (keypad code) front and centre.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <div className="w-full max-w-md rounded-3xl border border-borderc bg-white p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-2xl">📡</div>
        <h1 className="mt-5 text-2xl font-black text-brand">Je bent offline</h1>
        <p className="mt-3 text-brand/60">
          We konden Fittin' niet laden. Controleer je verbinding en probeer opnieuw.
        </p>
        <div className="mt-6 rounded-2xl bg-accent/10 p-4 text-left">
          <p className="text-sm font-black text-brand">Sta je aan de deur?</p>
          <p className="mt-1 text-sm text-brand/65">
            Je deurcode staat ook in de e-mail die je ± 5 minuten voor je sessie kreeg. Toets die in op
            het paneel naast de voordeur.
          </p>
        </div>
        <a
          href="/account"
          className="mt-6 inline-block rounded-full bg-brand px-7 py-3 font-bold text-white transition hover:opacity-90"
        >
          Probeer opnieuw
        </a>
        <p className="mt-4 text-xs text-brand/45">Nood? Bel altijd eerst 112. Vragen: info@fittin.be</p>
      </div>
    </main>
  );
}
