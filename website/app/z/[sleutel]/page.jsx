import { boekingVoorCheck, bestaandeCheck } from "./actions";
import { magInchecken } from "@/lib/netheid";
import ZaalCheck from "./ZaalCheck";

// De zaalcheck die opent vanuit de deurcodemail: "hoe vond je de zaal toen je binnenkwam?". Buiten (site): geen
// navigatie, geen afleiding — je staat in de gym met je telefoon in je hand.

export const dynamic = "force-dynamic";
export const metadata = { title: "Zaalcheck | Fittin'", robots: { index: false } };

const tijd = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function ZaalCheckPagina({ params, searchParams }) {
  const { sleutel } = await params;
  const sp = (await searchParams) || {};
  const b = await boekingVoorCheck(sleutel);
  const open = magInchecken(b);

  if (!b || !open) {
    const teVroeg = b && Date.now() < new Date(b.starts_at).getTime();
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-5">
        <div className="w-full max-w-md rounded-3xl border border-borderc bg-surface p-8 text-center">
          <p className="text-3xl">{teVroeg ? "⏳" : "🕓"}</p>
          <h1 className="mt-3 text-2xl font-black text-ink">{teVroeg ? "Nog even geduld" : "Deze link werkt niet meer"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {teVroeg
              ? "De zaalcheck opent 10 minuten voor je sessie. Tik dan opnieuw op de knop in je mail."
              : "De zaalcheck kan tot 2 uur na je sessie. Iets stuk? Meld het via je account of mail info@fittin.be."}
          </p>
          <a href="/account" className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand">Naar mijn account</a>
        </div>
      </main>
    );
  }

  const al = await bestaandeCheck(sleutel);
  const gekozen = ["netjes", "rommel", "stuk"].includes(sp.s) ? sp.s : null;
  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md">
        <p className="text-2xl font-black text-ink">Fittin<span className="text-accent">&rsquo;</span></p>
        <h1 className="mt-4 text-2xl font-black text-ink">Hoe vond je de zaal?</h1>
        <p className="mt-1 text-sm text-ink-soft">Toen je binnenkwam voor je sessie van {tijd(b.starts_at)}.</p>
        <ZaalCheck sleutel={sleutel} vooraf={gekozen} bestaand={al?.state || null} heeftFoto={!!al?.photo_path} />
      </div>
    </main>
  );
}
