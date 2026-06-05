"use client";
// Triggers the browser print dialog (→ "Save as PDF"). Hidden from the printed output itself.
export default function PrintButton({ label = "Print / PDF" }) {
  return (
    <button onClick={() => window.print()} className="print:hidden rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
      {label}
    </button>
  );
}
