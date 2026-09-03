import { tokenGeldig } from "./actions";
import MeldForm from "./MeldForm";

// Het meldscherm dat opent vanuit de deurcodemail. Bewust buiten (site): geen navigatiebalk, geen
// onderbalk, geen afleiding — je staat in de gym met je telefoon in je hand.

export const dynamic = "force-dynamic";
export const metadata = { title: "Iets melden | Fittin'", robots: { index: false } };

const tijd = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Melden({ params }) {
  const { token } = await params;
  const b = await tokenGeldig(token);

  if (!b) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-5">
        <div className="w-full max-w-md rounded-3xl border border-borderc bg-white p-8 text-center">
          <p className="text-3xl">🕓</p>
          <h1 className="mt-3 text-2xl font-black text-brand">Deze link is verlopen</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Een meldlink werkt tot een paar dagen na je sessie. Wil je nog iets kwijt, mail dan naar{" "}
            <a href="mailto:info@fittin.be" className="font-bold text-accentdark hover:underline">info@fittin.be</a>{" "}
            of meld het via je account.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md">
        <p className="text-2xl font-black text-brand">Fittin<span className="text-accent">&rsquo;</span></p>
        <h1 className="mt-4 text-2xl font-black text-brand">Wat is er mis?</h1>
        <p className="mt-1 text-sm text-ink-soft">Je sessie van {tijd(b.starts_at)}.</p>
        <MeldForm token={token} />
      </div>
    </main>
  );
}
