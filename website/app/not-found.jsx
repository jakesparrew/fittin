import Link from "next/link";

export const metadata = { title: "Pagina niet gevonden | Fittin'" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="text-center">
        <p className="text-8xl font-black text-brand/15 md:text-9xl">404</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Deze pagina bestaat niet</h1>
        <p className="mx-auto mt-3 max-w-md text-brand/60">Misschien is de link verouderd. Geen zorgen — terug naar de zaal:</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:opacity-90">Naar de homepagina</Link>
          <Link href="/boeken" className="rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Reserveer de gym</Link>
        </div>
      </div>
    </main>
  );
}
