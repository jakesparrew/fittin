import Link from "next/link";
import { confirmSubscriptionByToken } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inschrijving bevestigen | Fittin'", robots: { index: false, follow: false } };

// De tweede helft van de dubbele opt-in. Zelfde vorm als /uitschrijven: één scherm, één boodschap,
// één weg terug.
export default async function Bevestigen({ searchParams }) {
  const sp = await searchParams;
  const token = sp?.token;
  const result = token ? await confirmSubscriptionByToken(token) : { error: "Geen of ongeldige link." };

  return (
    <main className="bg-paper">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16 text-center">
        <div className="rounded-3xl border border-borderc bg-white p-8 shadow-sm">
          {result.ok ? (
            <>
              <h1 className="text-2xl font-black text-brand">Je staat op de lijst 🎉</h1>
              <p className="mt-3 text-sm text-brand/60">
                {result.alReeds
                  ? `${result.email} was al ingeschreven — je hoeft verder niets te doen.`
                  : `${result.email} ontvangt vanaf nu de nieuwsbrief van Fittin’. Uitschrijven kan met één klik onderaan elke mail.`}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black text-brand">Hm, dat lukte niet</h1>
              <p className="mt-3 text-sm text-brand/60">{result.error}</p>
            </>
          )}
          <Link href="/" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">
            Terug naar fittin.be
          </Link>
        </div>
      </div>
    </main>
  );
}
