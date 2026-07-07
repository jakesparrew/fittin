"use client";

// Submit button with a native confirm() guard — lets a server-component <form action={...}> ask for
// confirmation before a destructive/consequential action. Works inside a plain form or an ActionForm.
export default function ConfirmSubmit({ message, className = "", children, ...rest }) {
  return (
    <button
      type="submit"
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}
