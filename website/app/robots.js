export default function robots() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/auth/", "/beheer", "/coach", "/notificaties", "/api/", "/training"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
