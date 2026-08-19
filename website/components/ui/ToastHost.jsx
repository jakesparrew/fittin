"use client";
import { useEffect, useState } from "react";

// Mounted once per layout. Shows corner toasts dispatched via window event "fittin:toast"
// ({ detail: { type, msg } }). Fired by ActionForm on a server-action result.
export default function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e) => {
      const t = { id: ++n + Math.round(performance.now()), type: e.detail?.type || "success", msg: e.detail?.msg || "" };
      if (!t.msg) return;
      setToasts((ts) => [...ts, t]);
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 4200);
    };
    window.addEventListener("fittin:toast", onToast);
    return () => window.removeEventListener("fittin:toast", onToast);
  }, []);

  return (
    /* Op mobiel bovenaan, op md+ rechtsonder. Onderaan zitten op de telefoon drie vaste balken
       (tabbalk, de bevestigbalk van het boeken, de knoppenbalk van de workout-speler); een toast
       van 4,2 seconden legde zich daar bovenop en dekte de tabbladen af. Boven de vouw is er
       onder de sticky kopbalk (h-16) wél vrije ruimte. */
    <div className="pointer-events-none fixed left-4 right-4 top-20 z-[100] flex flex-col items-end gap-2 md:bottom-4 md:left-auto md:right-4 md:top-auto">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            // Geen pointer-events: er valt niets te klikken in een toast, en pointer-events-auto
            // ving tikken af die voor de onderliggende knoppen bedoeld waren.
            "flex max-w-full items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 " +
            (t.type === "error" ? "bg-red-500" : t.type === "info" ? "bg-brand/80" : "bg-brand")
          }
        >
          {/* "info" is bezig-met-iets, geen bevestiging — een vinkje zou daar liegen. */}
          <span>{t.type === "error" ? "⚠" : t.type === "info" ? "⟳" : "✓"}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
