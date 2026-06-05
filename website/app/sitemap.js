export default function sitemap() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  const routes = ["", "/degym", "/personal-training", "/boeken", "/calorieen-berekenen"];
  return routes.map((r) => ({
    url: `${site}${r}`,
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.8,
  }));
}
