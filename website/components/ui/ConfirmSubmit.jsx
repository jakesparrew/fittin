"use client";
import { bevestigSubmit } from "@/lib/native/dialogs";

// Submit button with a confirm guard — lets a server-component <form action={...}> ask for
// confirmation before a destructive/consequential action. Works inside a plain form or an ActionForm.
// Website: window.confirm, as before. App: the native system alert (no "fittin.be says" title).
export default function ConfirmSubmit({ message, className = "", children, ...rest }) {
  return (
    <button
      type="submit"
      onClick={(e) => bevestigSubmit(e, message)}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}
