"use client";
import { useActionState, useEffect, useRef } from "react";

// Drop-in <form> wrapper that runs a server action and fires a corner toast (via ToastHost) on
// success/error — so the user always sees that something happened (email sent, saved, etc.).
// While the action runs it dims + disables the whole form (a <fieldset disabled>), so every button
// inside automatically shows a clear "loading" state without per-button wiring.
export default function ActionForm({ action, success = "Opgeslagen ✓", className, children, ...rest }) {
  const [state, formAction, pending] = useActionState(async (_p, fd) => {
    const r = await action(fd);
    return r || { ok: true };
  }, null);
  const seen = useRef(null);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.error) window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "error", msg: state.error } }));
    else window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "success", msg: state.message || success } }));
  }, [state, success]);

  return (
    <form action={formAction} className={className} aria-busy={pending} {...rest}>
      <fieldset disabled={pending} className={"contents " + (pending ? "[&_button]:opacity-60 [&_button]:cursor-wait" : "")}>
        {children}
      </fieldset>
    </form>
  );
}
