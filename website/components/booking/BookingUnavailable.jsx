import Link from "next/link";

// Shown when Supabase isn't configured yet — honest placeholder, no fake slots.
export default function BookingUnavailable() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Online boeken</p>
        <h1 className="mt-3 text-3xl font-black md:text-4xl">Boeken komt zo live</h1>
        <p className="mt-4 leading-relaxed text-brand/70">
          Het boekingssysteem wordt momenteel gekoppeld aan de database. Heel binnenkort
          reserveer je hier de zaal — alleen of met vrienden — en open je de deur met de app.
        </p>
        <Link
          href="/degym"
          className="mt-8 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
        >
          Ontdek de gym
        </Link>
      </div>
    </main>
  );
}
