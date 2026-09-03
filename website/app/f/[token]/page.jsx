import Link from "next/link";
import { boekingVanToken, bestaandeScore, bewaarScore } from "./actions";
import BedanktScherm from "./BedanktScherm";

// De landingspagina van de sterren uit de mail. Eén tik in de mail = score geregistreerd, zonder
// login en zonder formulier.

export const dynamic = "force-dynamic";
export const metadata = { title: "Bedankt | Fittin'", robots: { index: false } };

export default async function Feedback({ params, searchParams }) {
  const { token } = await params;
  const sp = (await searchParams) || {};
  const b = await boekingVanToken(token);

  if (!b) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-5">
        <div className="w-full max-w-md rounded-3xl border border-borderc bg-white p-8 text-center">
          <p className="text-3xl">🕓</p>
          <h1 className="mt-3 text-2xl font-black text-brand">Deze link is verlopen</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Wil je toch nog iets kwijt? Mail <a href="mailto:info@fittin.be" className="font-bold text-accentdark hover:underline">info@fittin.be</a>.
          </p>
          <Link href="/account" className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand">Naar mijn account</Link>
        </div>
      </main>
    );
  }

  // De ster uit de mail meteen vastleggen: dat is de hele bedoeling van één tik.
  const uitUrl = Number(Array.isArray(sp.s) ? sp.s[0] : sp.s);
  if (Number.isInteger(uitUrl) && uitUrl >= 1 && uitUrl <= 5) {
    await bewaarScore(token, uitUrl);
  }
  const huidig = await bestaandeScore(b.id);

  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md">
        <p className="text-2xl font-black text-brand">Fittin<span className="text-accent">&rsquo;</span></p>
        <BedanktScherm token={token} score={huidig?.rating || null} opmerking={huidig?.comment || ""} />
      </div>
    </main>
  );
}
