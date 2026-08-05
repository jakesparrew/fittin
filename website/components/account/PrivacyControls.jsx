"use client";
import ActionForm from "@/components/ui/ActionForm";
import SubmitButton from "@/components/ui/SubmitButton";
import { requestAccountDeletion, cancelAccountDeletion, withdrawHealthConsent } from "@/app/(site)/account/actions";

// Rechten van betrokkenen, uitvoerbaar door het lid zelf (art. 15, 17, 20 en 7.3 AVG).
// Het privacybeleid beloofde dit al; zonder knoppen was dat een loze belofte.
//
// Verwijderen is bewust een AANVRAAG en geen directe knop: facturen moeten wettelijk 7 jaar bewaard
// blijven en aan boekingen hangen andere leden vast. Eén klik die dat allemaal onomkeerbaar zou
// wegvegen is geen zorgvuldigheid maar roekeloosheid — de beheerder voert het uit binnen de maand.
export default function PrivacyControls({ healthConsent, deletionRequestedAt }) {
  return (
    <section className="mt-12 rounded-3xl border border-borderc bg-white p-6">
      <h2 className="text-xl font-black text-brand">Je gegevens</h2>
      <p className="mt-1 text-sm text-brand/55">
        Je bepaalt zelf wat we van je bijhouden. Hoe we met je gegevens omgaan staat in ons{" "}
        <a href="/privacy" className="font-bold text-accentdark hover:underline">privacybeleid</a>.
      </p>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand">Download al je gegevens</p>
            <p className="mt-0.5 text-xs text-brand/55">Een volledig bestand met je account, boekingen, betalingen en metingen.</p>
          </div>
          <a
            href="/api/me/export"
            className="shrink-0 rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent"
          >
            ⬇ Downloaden
          </a>
        </div>

        {healthConsent && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand">Gewicht en lichaamsgegevens wissen</p>
              <p className="mt-0.5 text-xs text-brand/55">
                Trekt je toestemming in en verwijdert je gewichtshistoriek, lengte en streefgewicht. Meteen en definitief.
              </p>
            </div>
            <ActionForm
              action={withdrawHealthConsent}
              success="Gewist ✓"
              className="shrink-0"
              onSubmit={(e) => { if (!confirm("Je gewichtshistoriek, lengte en streefgewicht worden definitief gewist. Doorgaan?")) e.preventDefault(); }}
            >
              <SubmitButton className="rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:border-red-400 hover:text-red-600">
                Wissen
              </SubmitButton>
            </ActionForm>
          </div>
        )}

        {deletionRequestedAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-700">Je vroeg om je account te verwijderen</p>
              <p className="mt-0.5 text-xs text-brand/60">
                We behandelen je aanvraag binnen 30 dagen en bevestigen per e-mail. Van gedacht veranderd? Trek ze gerust weer in.
              </p>
            </div>
            <ActionForm action={cancelAccountDeletion} success="Ingetrokken ✓" className="shrink-0">
              <SubmitButton className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
                Aanvraag intrekken
              </SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand">Account laten verwijderen</p>
              <p className="mt-0.5 text-xs text-brand/55">
                We wissen je persoonsgegevens binnen 30 dagen. Facturen moeten we wettelijk 7 jaar bewaren — die blijven
                bestaan, los van je profiel.
              </p>
            </div>
            <ActionForm
              action={requestAccountDeletion}
              success="Aanvraag geregistreerd ✓"
              className="shrink-0"
              onSubmit={(e) => { if (!confirm("Je vraagt om je account en je persoonsgegevens te laten verwijderen. We behandelen dit binnen 30 dagen. Doorgaan?")) e.preventDefault(); }}
            >
              <SubmitButton className="rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm font-bold text-brand/70 transition hover:border-red-400 hover:text-red-600">
                Verwijdering aanvragen
              </SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </section>
  );
}
