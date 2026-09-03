"use client";
import { useState } from "react";
import { geefDoorAanCoach } from "@/app/beheer/aanbreng-actions";
import ActionForm from "@/components/ui/ActionForm";
import SubmitButton from "@/components/ui/SubmitButton";
import SearchSelect from "@/components/admin/SearchSelect";
import { FEE_MAX_CENTS, feeZin } from "@/lib/aanbreng";

// Een PT-intake doorgeven aan een coach, rechtstreeks vanaf het bericht in de inbox.
//
// Dit is de plek waar een intake een doorgave wordt — nog voor de klant een account heeft. Daarom
// draait alles hier om het e-mailadres: dat is de sleutel waarop de doorgave later automatisch aan
// het profiel hangt (trigger link_referral_to_profile, migratie 0152).
//
// Het formulier zit achter een klik. Op een inboxbericht is doorgeven de uitzondering, niet de
// regel: een permanent openstaand formulier van acht velden zou op elk ander bericht in de weg
// staan. Wat de knop doet, staat eronder in gewone taal — je hoort niet te moeten klikken om te
// weten wat er gaat gebeuren.

// € 6 → "6". Het invoerveld is type=number en wil een punt, geen komma; de server action leest
// beide (aanbreng-actions.js).
const eur = (cents) => String((Math.round(Number(cents) || 0)) / 100);

export default function GeefDoorAanCoach({ coaches = [], defaultEmail = "", defaultName = "", inboundEmailId = "", feeCents = 600, defaultCoachId = "", voorkeur = false }) {
  const [open, setOpen] = useState(false);

  // Een coach die zelf op "geen nieuwe klanten" staat, hoort hier niet in de lijst: de server action
  // weigert hem toch, en een keuze aanbieden die daarna afketst is erger dan hem weglaten.
  const beschikbaar = coaches.filter((c) => c.accepting);
  const uitleg = `De coach krijgt een melding en een mail en moet zelf aanvaarden. Pas daarna geldt ${feeZin(feeCents)}.`;

  if (!beschikbaar.length) {
    return (
      <p className="rounded-2xl border border-borderc bg-white px-5 py-4 text-sm text-brand/60">
        Geen enkele coach staat op dit moment open voor nieuwe klanten, dus er valt niets door te geven.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-borderc bg-white p-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90"
        >
          Geef door aan coach
        </button>
        <p className="mt-2 text-xs text-brand/50">{uitleg}</p>
      </div>
    );
  }

  return (
    <ActionForm action={geefDoorAanCoach} success="Doorgegeven ✓" className="rounded-2xl border border-borderc bg-white p-5">
      <input type="hidden" name="source" value="intake" />
      <input type="hidden" name="inboundEmailId" value={inboundEmailId} />

      <p className="text-sm font-bold text-brand">Geef door aan coach</p>
      <p className="mt-1 text-xs text-brand/50">{uitleg}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Veld t="Coach">
          <SearchSelect name="coachId" required defaultValue={defaultCoachId} placeholder="Kies een coach…"
            options={beschikbaar.map((c) => ({ value: c.id, label: c.full_name }))} />
        </Veld>
        <Veld t="Aanbreng per sessie (€)">
          <input name="feeEur" type="number" step="0.5" min="0" max={FEE_MAX_CENTS / 100} defaultValue={eur(feeCents)}
            className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
        </Veld>
        <Veld t="E-mail van de klant">
          <input name="clientEmail" type="email" required defaultValue={defaultEmail} placeholder="naam@voorbeeld.be"
            className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
        </Veld>
        <Veld t="Naam van de klant">
          <input name="clientName" defaultValue={defaultName} placeholder="Voornaam Naam"
            className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
        </Veld>
      </div>

      {/* Twee tarieven, twee situaties. Koos de klant in de intake zelf al een coach, dan bracht
          Fittin' de klant aan maar niet de match — de gym kan daar een ander bedrag voor vragen. */}
      {voorkeur && (
        <p className="mt-2 text-xs text-brand/50">
          Deze klant vroeg in de intake zelf al naar deze coach. Daarom staat het voorkeurtarief ingevuld: Fittin&rsquo; bracht de klant aan, maar niet de match.
        </p>
      )}
      <p className="mt-2 text-xs text-brand/45">
        Dit staat enkel in het tegoedboek van de coach. Wat de klant zelf betaalt, verandert niet.
      </p>

      {/* Grenzen zijn de uitzondering: bijna elke doorgave loopt onbeperkt door. Ingeklapt dus. */}
      <details className="mt-3 border-t border-borderc pt-3">
        <summary className="cursor-pointer list-none text-xs font-bold text-brand/50 transition hover:text-brand">+ Grens of notitie</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Veld t="Stopt na … sessies">
            <input name="sessionsCap" type="number" min="1" placeholder="onbeperkt"
              className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
          </Veld>
          <Veld t="Stopt na … maanden">
            <input name="monthsCap" type="number" min="1" placeholder="onbeperkt"
              className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
          </Veld>
        </div>
        <div className="mt-3">
          <Veld t="Notitie voor de coach">
            <textarea name="note" rows={2} placeholder="Wat de coach hierover moet weten…"
              className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
          </Veld>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Doorgeven…" className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90">
          Doorgeven
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-bold text-brand/40 transition hover:text-brand">Annuleer</button>
      </div>
    </ActionForm>
  );
}

function Veld({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
