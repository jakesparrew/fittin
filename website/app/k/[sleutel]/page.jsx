import Link from "next/link";
import { uitnodigingVan } from "./actions";
import KomKnop from "./KomKnop";

// "Ik kom" uit de uitnodigingsmail. Buiten (site), zoals /m en /z: één scherm, één knop.
// Een gast zonder account krijgt daarna de weg naar een account mét de code van wie hem uitnodigde — zo telt hij
// voor diens punten, en is zijn eigen eerste uur gratis.

export const dynamic = "force-dynamic";
export const metadata = { title: "Kom je mee? | Fittin'", robots: { index: false } };

const tijd = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Kom({ params }) {
  const { sleutel } = await params;
  const u = await uitnodigingVan(sleutel);
  if (!u) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-5">
        <div className="w-full max-w-md rounded-3xl border border-borderc bg-surface p-8 text-center">
          <p className="text-3xl">🤷</p>
          <h1 className="mt-3 text-2xl font-black text-ink">Deze uitnodiging bestaat niet meer</h1>
          <p className="mt-2 text-sm text-ink-soft">Misschien werd de sessie verplaatst of geannuleerd. Vraag het even na bij wie je uitnodigde.</p>
          <Link href="/boeken" className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand">Zelf een uur boeken</Link>
        </div>
      </main>
    );
  }
  const b = u.boeking;
  const host = b.host?.full_name?.split(" ")[0] || "Je vriend";
  const code = String(b.host?.referral_code || "").trim();
  const signup = code ? `/uitnodiging/${encodeURIComponent(code)}` : "/login?mode=signup";
  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md">
        <p className="text-2xl font-black text-ink">Fittin<span className="text-accent">&rsquo;</span></p>
        <h1 className="mt-4 text-2xl font-black text-ink">{host} neemt je mee trainen 💪</h1>
        <p className="mt-1 text-sm text-ink-soft">{b.services?.name || "Sessie"} · {tijd(b.starts_at)} · Aannemersstraat 186, Gent</p>
        <KomKnop sleutel={sleutel} al={!!u.rij.confirmed_at} host={host} />
        {u.soort === "gast" && (
          <div className="mt-6 rounded-2xl border border-borderc bg-surface p-5">
            <p className="font-black text-ink">Nog geen account?</p>
            <p className="mt-1 text-sm text-ink-soft">
              Maak er gratis een: dan staat deze sessie in je account, en je <b>eigen eerste uur is gratis</b> wanneer je later zelf boekt.
            </p>
            <Link href={signup} className="mt-4 inline-flex rounded-full bg-brand px-5 py-2.5 text-sm font-black text-white">Maak mijn account</Link>
          </div>
        )}
      </div>
    </main>
  );
}
