"use client";
import { useFormStatus } from "react-dom";

// Submit button that shows a spinner + disables itself while its <form> action is running.
// Use inside any server-action <form>: <SubmitButton className="...">Opslaan</SubmitButton>
export default function SubmitButton({ children, pendingText, className = "", ...rest }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className + (pending ? " cursor-wait opacity-70" : "")} {...rest}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingText || "Bezig…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
