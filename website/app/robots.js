export default function robots() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/auth/",
        "/beheer",
        // Let op: "/coach" alleen zou ook /coaches en elk coachprofiel blokkeren — robots matcht op
        // voorvoegsel. Enkel het afgeschermde coachportaal mag dicht.
        "/coach$",
        "/coach/",
        "/notificaties",
        "/api/",
        "/training",
        // Achter een login of geen landingspagina — crawlbudget hoort naar de publieke pagina's.
        "/plannen",
        "/community",
        "/login",
        "/uitschrijven",
      ],
      // /w/ (gedeelde schemalinks) staat er bewust NIET bij: die pagina's dragen zelf noindex, en
      // een crawler moet ze kunnen ophalen om die noindex überhaupt te zien.
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
