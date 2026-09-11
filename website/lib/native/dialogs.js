import { has } from "./platform";
import { hapticWarning } from "./haptics";

// Native confirm dialogs.
//
// window.confirm in the app shows a "fittin.be says" title: a web tell, and App Review notices.
// In the app we use the system alert (@capacitor/dialog); on the web nothing changes.

/**
 * Ask for confirmation. Resolves true/false.
 * @param {string} message
 * @param {{ title?: string, ok?: string, cancel?: string }} [opts]
 */
export async function bevestig(message, { title = "Ben je zeker?", ok = "Doorgaan", cancel = "Annuleren" } = {}) {
  if (!has("Dialog")) return window.confirm(message);
  hapticWarning();
  const { Dialog } = await import("@capacitor/dialog");
  const { value } = await Dialog.confirm({ title, message, okButtonTitle: ok, cancelButtonTitle: cancel });
  return value;
}

/**
 * Drop-in for the old synchronous guard on a form's onSubmit or a submit button's onClick:
 *
 *   onSubmit={(e) => bevestigSubmit(e, "Deze boeking annuleren?")}
 *
 * Web: exactly the old behaviour (window.confirm, preventDefault on cancel).
 * App: the native dialog is asynchronous, so this submit is stopped, the question is asked, and on
 * "Doorgaan" the SAME form is resubmitted with the SAME submitter (so name/value of the pressed
 * button still reach the server action). A one-shot flag lets that second submit through.
 */
export function bevestigSubmit(e, message, opts) {
  if (!has("Dialog")) {
    if (!window.confirm(message)) e.preventDefault();
    return;
  }
  const isSubmit = e.type === "submit";
  const form = isSubmit ? e.currentTarget : e.currentTarget?.form;
  if (!form) return;
  if (form.dataset.bevestigd === "1") {
    delete form.dataset.bevestigd;
    return;
  }
  e.preventDefault();
  const submitter = isSubmit ? e.nativeEvent?.submitter : e.currentTarget;
  bevestig(message, opts).then((ok) => {
    if (!ok) return;
    form.dataset.bevestigd = "1";
    form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
  });
}
