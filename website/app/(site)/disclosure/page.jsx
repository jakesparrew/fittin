import Link from "next/link";

// Zonder eigen description erfde deze pagina die van de homepage ("privé fitness in Gent...") —
// in Google en bij delen las /disclosure dus als de startpagina.
export const metadata = {
  title: "Affiliate-disclosure | Fittin'",
  description:
    "Sommige links op fittin.be zijn affiliate-links. Zo werkt het, wat het voor jou betekent, en waarom het niets aan de prijs verandert.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/disclosure` },
};

export default function Disclosure() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Link href="/supplementen" className="text-sm font-semibold text-brand/50 hover:text-brand">← Supplementen</Link>
        <h1 className="mt-4 text-3xl font-black text-brand md:text-4xl">Affiliate-disclosure</h1>
        <div className="mt-6 space-y-4 leading-relaxed text-brand/70">
          <p>
            Sommige links op deze site (bijvoorbeeld op onze <Link href="/supplementen" className="font-bold text-accentdark">supplementenpagina</Link>)
            zijn affiliate-links. Als je via zo&rsquo;n link iets koopt bij een partner zoals Body &amp; Fit,
            kunnen wij een kleine commissie ontvangen.
          </p>
          <p>
            <strong>Voor jou verandert er niets aan de prijs.</strong> We raden enkel producten aan die we
            zelf gebruiken of zinvol vinden voor onze leden. De commissie helpt ons om Fittin&rsquo; — een
            sportvereniging zonder winstoogmerk — betaalbaar te houden.
          </p>
          <p className="text-sm text-brand/50">
            Vragen? Mail ons gerust op <a href="mailto:info@fittin.be" className="underline">info@fittin.be</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
