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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
