import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

// Waar een gedeelde uitnodiging landt. Vroeger stuurde elke deelknop rechtstreeks naar
// /login?mode=signup&ref=CODE — een formulier met "Inloggen" als titel, en dat is ook wat er in
// WhatsApp verscheen. Deze pagina zit ertussen: ze legt in vier regels uit wat Fittin is en stuurt
// daarna door naar exact diezelfde loginpagina. De inwisselketen blijft dus volledig ongemoeid.
//
// Bewust NIET in robots.js op disallow: dan halen de previewbots van WhatsApp en Facebook de
// og-tags niet op en is het hele punt weg. Wel noindex, want een uitnodiging hoort niet in Google.
async function haalVoornaam(code) {
  if (!/^[A-Za-z0-9]{4,16}$/.test(String(code || ""))) return "";
  try {
    const { data } = await createAdminClient()
      .from("profiles").select("full_name").ilike("referral_code", code).maybeSingle();
    return String(data?.full_name || "").trim().split(/\s+/)[0] || "";
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }) {
  const { code } = await params;
  const voornaam = await haalVoornaam(code);
  const titel = voornaam ? `${voornaam} nodigt je uit bij Fittin'` : "Je bent uitgenodigd bij Fittin'";
  return {
    title: titel,
    description: "Je eerste uur is gratis. Bij Fittin' in Gent boek je de héle zaal privé — alleen of met tot 4 vrienden, voor dezelfde prijs.",
    robots: { index: false, follow: false },
    alternates: { canonical: `${SITE}/uitnodiging/${code}` },
    openGraph: { title: titel, description: "Je eerste uur is gratis — de hele zaal privé, €15 per uur, geen lidgeld." },
  };
}

export default async function Uitnodiging({ params }) {
  const { code } = await params;
  const voornaam = await haalVoornaam(code);
  // Ook bij een onbekende code tonen we gewoon de pagina, zonder naam. Een dode link uit een oude
  // groepschat mag een bezoeker niet op een foutmelding zetten.
  const naarAanmelden = `/login?mode=signup&ref=${encodeURIComponent(code)}`;

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Uitnodiging</p>
        <h1 className="mt-3 text-3xl font-black leading-tight text-brand sm:text-4xl md:text-5xl">
          {voornaam ? <>{voornaam} nodigt je uit om <span className="text-accentdark">samen te trainen</span></> : <>Je bent uitgenodigd om <span className="text-accentdark">mee te trainen</span></>}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-brand/70">
          Bij Fittin&rsquo; in Gent boek je geen plekje tussen anderen — je boekt de <strong className="text-brand">hele zaal</strong> voor
          jezelf. Alleen, of met tot vier vrienden, voor exact dezelfde prijs.
        </p>

        <div className="mt-8 rounded-3xl bg-brand p-6 text-white md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">Voor jou</p>
          <p className="mt-2 text-2xl font-black">Je eerste uur is gratis</p>
          <p className="mt-1.5 text-sm text-lav">Geen lidgeld, geen abonnement dat vastzit. Daarna betaal je € 15 per uur.</p>
          <Link href={naarAanmelden} className="mt-6 block rounded-full bg-accent py-4 text-center text-lg font-black text-brand transition hover:opacity-90">
            Maak je account aan →
          </Link>
          <p className="mt-3 text-center text-xs text-lav">Duurt een minuut. Je bankkaart heb je niet nodig.</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["De zaal is van jou", "Tijdens jouw uur is er niemand anders binnen. Geen wachtrij aan een toestel."],
            ["Zelfde prijs, met z'n vieren", "€ 15 voor het uur — of je nu alleen komt of met drie vrienden."],
            ["Open van 6 tot 23 uur", "Je opent de deur met een code die je per mail krijgt, vlak voor je sessie."],
          ].map(([kop, tekst]) => (
            <div key={kop} className="rounded-2xl border border-borderc bg-white p-5">
              <h2 className="font-black text-brand">{kop}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{tekst}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-ink-soft">
          Al een account? <Link href={`/login?ref=${encodeURIComponent(code)}`} className="font-bold text-accentdark hover:underline">Log gewoon in</Link>.
          {" "}Meer weten over de gym? <Link href="/degym" className="font-bold text-accentdark hover:underline">Bekijk de zaal</Link>.
        </p>
      </div>
    </main>
  );
}
