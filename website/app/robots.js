export default function robots() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/auth/"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
