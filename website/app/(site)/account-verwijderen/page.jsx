import Link from "next/link";

// Public page required by Google Play (Data safety → account deletion URL) and linked from the app
// menu. It must work WITHOUT logging in: it's for people who can't or won't open the app.
// The process itself is the one in Account → Je gegevens (components/account/PrivacyControls).
export const metadata = {
  title: "Account verwijderen | Fittin'",
  description: "Zo vraag je de verwijdering van je Fittin'-account en je persoonsgegevens aan.",
};

export default function AccountVerwijderen() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-14">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Je gegevens</p>
        <h1 className="mt-2 text-3xl font-black text-ink md:text-4xl">Je account verwijderen</h1>
        <p className="mt-4 leading-relaxed text-ink/70">
          Je kan op elk moment vragen om je Fittin’-account en je persoonsgegevens te verwijderen — in de app, op de
          website of per e-mail.
        </p>

        <section className="mt-8 rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="text-lg font-black text-ink">In de app of op de website</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink/75">
            <li>Log in en open <strong>Account</strong>.</li>
            <li>Scrol naar <strong>Je gegevens</strong>.</li>
            <li>Tik op <strong>Verwijdering aanvragen</strong> en bevestig.</li>
          </ol>
          <Link href="/login?next=/account%23gegevens" className="mt-5 inline-flex rounded-full bg-accent px-6 py-3 font-bold text-brand transition hover:opacity-90">
            Naar mijn account
          </Link>
        </section>

        <section className="mt-4 rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="text-lg font-black text-ink">Per e-mail</h2>
          <p className="mt-2 text-ink/75">
            Mail naar <a href="mailto:info@fittin.be?subject=Account%20verwijderen" className="font-bold text-accentdark">info@fittin.be</a> vanaf
            het e-mailadres van je account, met de vraag om je account te verwijderen.
          </p>
        </section>

        <section className="mt-4 rounded-3xl border border-borderc bg-surface p-6">
          <h2 className="text-lg font-black text-ink">Wat er gebeurt</h2>
          <ul className="mt-3 space-y-2 text-ink/75">
            <li><strong>Binnen 30 dagen</strong> verwijderen we je profiel, je trainingen, je metingen, je berichten en je inloggegevens, en bevestigen we dat per e-mail.</li>
            <li><strong>Facturen en betalingen</strong> moeten we wettelijk 7 jaar bewaren. Die blijven bestaan, los van je profiel, en worden nergens anders voor gebruikt.</li>
            <li>Tot de verwijdering is uitgevoerd, kan je je aanvraag in je account nog intrekken.</li>
            <li>Een lopend abonnement stopt samen met je account; openstaand tegoed vervalt.</li>
          </ul>
          <p className="mt-4 text-sm text-ink/55">
            Meer over hoe we met je gegevens omgaan staat in ons <Link href="/privacy" className="font-bold text-accentdark">privacybeleid</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
