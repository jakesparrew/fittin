import { zetFeedbackUit } from "../actions";

// De uitschrijflink onderaan de feedbackmail. Art. 21 AVG vraagt dat het bezwaarrecht uitdrukkelijk
// en apart wordt aangeboden — dus niet verstopt in de nieuwsbriefvoorkeuren, en zonder login.
export const dynamic = "force-dynamic";
export const metadata = { title: "Uitgezet | Fittin'", robots: { index: false } };

export default async function FeedbackUit({ params }) {
  const { token } = await params;
  const r = await zetFeedbackUit(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-md rounded-3xl border border-borderc bg-white p-8 text-center">
        <p className="text-3xl">{r?.ok ? "✅" : "🕓"}</p>
        <h1 className="mt-3 text-2xl font-black text-brand">{r?.ok ? "Geregeld" : "Deze link is verlopen"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {r?.ok
            ? "Je krijgt na je sessies geen vraag meer. Je deurcodes en boekingsmails blijven gewoon komen."
            : "Zet het uit via je account, of mail info@fittin.be."}
        </p>
        <a href="/account" className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand">Naar mijn account</a>
      </div>
    </main>
  );
}
