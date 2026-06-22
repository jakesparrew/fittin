export default function sitemap() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  const routes = ["", "/degym", "/personal-training", "/coaches", "/oefeningen", "/workouts", "/boeken", "/lidmaatschap", "/calorieen-berekenen", "/supplementen", "/events", "/huisregels", "/disclosure", "/privacy"];
  return routes.map((r) => ({
    url: `${site}${r}`,
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.8,
  }));
}
