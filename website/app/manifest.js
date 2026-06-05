export default function manifest() {
  return {
    name: "Fittin' — privé fitness in Gent",
    short_name: "Fittin'",
    description:
      "Reserveer de privégym, train met je coach en open straks de deur met de app.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#22194f",
    lang: "nl",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
