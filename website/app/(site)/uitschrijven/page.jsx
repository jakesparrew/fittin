import Link from "next/link";
import { unsubscribeByToken } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uitschrijven | Fittin'" };

export default async function Unsubscribe({ searchParams }) {
  const sp = await searchParams;
  const token = sp?.token;
  let result = { error: "Geen of ongeldige link." };
  if (token) result = await unsubscribeByToken(token);

  return (
    <main className="bg-paper">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16 text-center">
        <div className="rounded-3xl border border-borderc bg-white p-8 shadow-sm">
          {result.ok ? (
            <>
              <h1 className="text-2xl font-black text-brand">Je bent uitgeschreven</h1>
              <p className="mt-3 text-sm text-brand/60">
                {result.email} ontvangt geen nieuwsbrieven meer van Fittin&rsquo;. Boekingsbevestigingen blijf je wel krijgen.
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
