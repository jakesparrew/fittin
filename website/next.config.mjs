/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Clickjacking protection (pentest f-001).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing protection.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs cross-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful browser features we don't use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig = {
  // Allow next/image to optimise Supabase-hosted media (coach photos, event/feed images).
  // jsdelivr staat erbij zolang de oefeningstills daar staan: zo kan ExerciseMedia nú al via
  // next/image (72 KB-origineel → ~64 px-variant) in plaats van te wachten op de spiegeling.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "cdn.jsdelivr.net" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // /supplementen staat TIJDELIJK uit (29-08-2026): er liep geen affiliate (AWIN_AFFID was
      // nooit ingevuld) en de pagina haalde 15 weergaven in 30 dagen. Ze komt terug zodra er een
      // echte partner is. Daarom permanent:false → een 307, zodat Google de URL blijft kennen en
      // hem niet uit de index gooit. Bestemming is de calorieënpagina: de dichtstbijzijnde
      // voedingspagina, en meteen de plek die er vroeger zelf naar linkte.
      { source: "/supplementen", destination: "/calorieen-berekenen", permanent: false },
    ];
  },
};

export default nextConfig;
