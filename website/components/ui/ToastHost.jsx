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
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 " +
            (t.type === "error" ? "bg-red-500" : "bg-brand")
          }
        >
          <span>{t.type === "error" ? "⚠" : "✓"}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
