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
    // Android laat een geïnstalleerde webapp in het deelmenu verschijnen. Daardoor kan je vanuit
    // Instagram, YouTube of TikTok rechtstreeks "Delen → Fittin'" doen en belandt de link op
    // /bewaren. iOS ondersteunt dit niet (Apple heeft geen share target voor webapps) — daar is
    // de plakknop op dat scherm de weg. Welk veld de link bevat verschilt per app, dus /bewaren
    // kijkt in alle drie.
    share_target: {
      action: "/bewaren",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
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
