"use client";

// Print / "Opslaan als PDF" — de browser-printdialoog levert een nette PDF zonder extra library.
// De pagina's zelf verbergen navigatie/knoppen via print:hidden en tonen een print:block briefhoofd.
export default function PrintButton({ label = "⬇ PDF / afdrukken", className = "" }) {
  return (
    <button
      onClick={() => window.print()}
      className={"rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 print:hidden " + className}
    >
      {label}
    </button>
  );
}
