"use client";
import { useActie } from "./useActie";

// Drop-in <form> wrapper that runs a server action and fires a corner toast (via ToastHost) on
// success/error — so the user always sees that something happened (email sent, saved, etc.).
// While the action runs it dims + disables the whole form (a <fieldset disabled>), so every button
// inside automatically shows a clear "loading" state without per-button wiring.
//
// Het uitvoeren en melden zelf zit in useActie — dezelfde hook die de beheerwizards gebruiken, zodat
// een fout er overal hetzelfde uitziet en een gooiende actie nergens meer de foutpagina geeft.
export default function ActionForm({ action, success = "Opgeslagen ✓", className, children, ...rest }) {
  const [, formAction, pending] = useActie(action, { success });

  return (
    <form action={formAction} className={className} aria-busy={pending} {...rest}>
      {/* `[&_button]:transition` staat BUITEN de voorwaarde. Zat hij erin, dan verscheen hij op
          hetzelfde moment als opacity-60 en viel er niets te animeren — het dimmen sprong dan nog
          steeds in één frame. Nu vervaagt het bij het starten én bij het afronden, in alle 108
          formulieren tegelijk. */}
      <fieldset disabled={pending} className={"contents [&_button]:transition " + (pending ? "[&_button]:opacity-60 [&_button]:cursor-wait" : "")}>
        {children}
      </fieldset>
    </form>
  );
}
