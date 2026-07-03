// Shared structured-data (JSON-LD) builders — one source of truth so the two HealthClub blobs on
// home/degym stop drifting, and exercise/coach/FAQ pages all emit consistent schema. Builders return
// plain objects; pages render them with:
//   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />
// (or use jsonLdScript() which returns the ready props object).

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
const PHONE = "+32498627410"; // published business number (decision #1)
const ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: "Aannemersstraat 186",
  postalCode: "9040",
  addressLocality: "Gent",
  addressCountry: "BE",
};

// The gym itself — used on home + degym (previously two drifted copies).
export function healthClubLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HealthClub",
    name: "Fittin'",
    description: "Privé fitness & personal training in Gent. Reserveer de zaal voor jezelf of train met een coach.",
    url: SITE,
    email: "info@fittin.be",
    telephone: PHONE,
    image: `${SITE}/opengraph-image`,
    priceRange: "€€",
    address: ADDRESS,
    geo: { "@type": "GeoCoordinates", latitude: 51.0686, longitude: 3.7558 },
    hasMap: "https://www.google.com/maps?q=Aannemersstraat+186,+9040+Gent",
    sameAs: ["https://www.instagram.com/fittin_gent/", "https://www.facebook.com/fittingent"],
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "06:00",
      closes: "23:00",
    }],
  };
}

// Breadcrumb trail. items = [{ name, url }] (url absolute or path).
export function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url.startsWith("http") ? it.url : `${SITE}${it.url}`,
    })),
  };
}

// FAQPage. qa = [{ q, a }].
export function faqLd(qa) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (qa || []).filter((x) => x?.q && x?.a).map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

// A single exercise (ExercisePlan-ish; schema.org has no "Exercise" so we use HowTo for the steps).
export function exerciseHowToLd(ex) {
  const steps = Array.isArray(ex.instructions) ? ex.instructions : [];
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `${ex.name} — correcte uitvoering`,
    description: (steps[0] || ex.tips || `Zo voer je ${ex.name} correct uit.`).slice(0, 300),
    ...(ex.image_url ? { image: ex.image_url } : {}),
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s })),
  };
}

// A coach (Person) for /coaches/[id].
export function personLd(coach, url) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: coach.full_name,
    ...(coach.coach_specialty ? { jobTitle: coach.coach_specialty } : {}),
    ...(coach.coach_photo_url ? { image: coach.coach_photo_url } : {}),
    ...(coach.coach_bio ? { description: String(coach.coach_bio).slice(0, 300) } : {}),
    worksFor: { "@type": "HealthClub", name: "Fittin'", url: SITE },
    url: url.startsWith("http") ? url : `${SITE}${url}`,
  };
}

// Convenience: the props object for a JSON-LD <script>.
export function jsonLdScript(obj) {
  return { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(obj) } };
}
